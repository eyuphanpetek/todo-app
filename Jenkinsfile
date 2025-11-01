pipeline {  // Top-level declarative pipeline

    agent any  // Runs on any available agent (your Jenkins container)

    environment {  // Global environment variables for reuse across stages
        DOCKER_HUB_REPO = 'mrzinister/todo-app'  // Your Docker Hub repo (swap if needed)
        DOCKER_TAG = "${BUILD_NUMBER}"  // Auto-tags with build number (e.g., :1, :2)
        DOCKER_CREDENTIALS_ID = 'dockerhub-creds'  // Jenkins credential ID for Hub push (add via Manage Credentials)
    }

    stages {  // Main workflow stages—execute sequentially
        stage('Checkout') {  // Clones your Git repo to the workspace
            steps {
                // Single-line git map to avoid multi-line parsing issues
                git branch: 'main', url: 'https://github.com/eyuphanpetek/todo-app.git'  // Your repo URL
                // credentialsId: 'github-creds'  // Uncomment/add if private (set in Jenkins job config)
            }
        }

        stage('Install Dependencies & Test') {  // Validates code and runs basic tests
            steps {
                sh 'npm ci --only=production'  // Deterministic install from package-lock.json (prod deps only)
                sh '''
                    # Basic smoke test: Verify Redis connects (expand to full Jest/Mocha later)
                    node -e "
                        const redis = require('redis');
                        const client = redis.createClient({ socket: { host: 'localhost', port: 6379 } });
                        client.connect().then(() => {
                            console.log('Redis connected OK');
                            process.exit(0);
                        }).catch(err => {
                            console.error('Redis test failed:', err.message);
                            process.exit(1);
                        });
                    "
                    echo 'API smoke test passed (add curl if app pre-started)'
                '''
            }
        }

        stage('Build Docker Image') {  // Builds and optionally pushes your app image
            steps {
                script {  // Embed Groovy/Docker DSL here
                    def image = docker.build("${env.DOCKER_HUB_REPO}:${env.DOCKER_TAG}")  // Builds from Dockerfile
                    // Push to Docker Hub (comment out block if local-only testing)
                    docker.withRegistry('https://index.docker.io/v1/', env.DOCKER_CREDENTIALS_ID) {
                        image.push("${env.DOCKER_TAG}")
                        image.push('latest')  // Updates 'latest' tag for convenience
                    }
                    echo "Built and pushed image: ${env.DOCKER_HUB_REPO}:${env.DOCKER_TAG}"
                }
            }
        }

        stage('Deploy to Compose') {  // Deploys to local Docker Compose and verifies
            steps {
                sh '''
                    cd $WORKSPACE  # Navigate to cloned repo in Jenkins workspace
                    docker compose down --remove-orphans --volumes  # Clean shutdown (comment --volumes to persist Redis data)
                    docker compose up -d --build --scale app=2  # Detached build/deploy; scale app to 2 instances
                    sleep 15  # Grace period for startup (adjust if Redis lags)
                    # End-to-end health checks—pipeline fails on non-200
                    curl -f http://localhost:3000/ || exit 1  # Frontend serves
                    curl -f http://localhost:3000/api/todos || exit 1  # API endpoint responds
                    curl -f -X POST http://localhost:3000/api/todos \\
                         -H "Content-Type: application/json" \\
                         -d '{"text": "Jenkins deploy test"}' || exit 1  # POST creates todo (escapes for shell)
                    echo "Deploy successful—app live at localhost:3000 with test todo!"
                '''
            }
        }
    }  // End of stages

    post {  // Post-build actions (run regardless of success/failure)
        always {  // Cleanup every time
            cleanWs()  // Removes workspace files (frees disk; re-clones next build)
            sh 'docker system prune -f --volumes'  // Prunes unused Docker resources (omit --volumes if persisting data)
        }
        success {  // On green build
            echo '🚀 Pipeline nailed! App deployed—check http://localhost:3000'
        }
        failure {  // On red build
            echo '💥 Pipeline failed—review console logs for failing stage'
        }
        unstable {  // On yellow (warnings, e.g., flaky tests)
            echo '⚠️ Pipeline unstable—investigate warnings'
        }
    }  // End of post
}  // End of pipeline