pipeline {  // Top-level: Defines a declarative pipeline (vs. scripted—easier syntax)
    agent any  // Run on any agent (your Jenkins container; scales to cloud later)

    environment {  // Global vars—available in all stages (e.g., for Docker tags)
        DOCKER_HUB_REPO = 'mrzinister/todo-app'  // Swap with your Hub username/repo
        DOCKER_TAG = "${BUILD_NUMBER}"  // Unique tag (e.g., :1, :2)—avoids overwriting 'latest'
        DOCKER_CREDENTIALS_ID = 'dockerhub-creds'  // Matches Jenkins creds ID (add in Step 3 if pushing)
    }

    stages {  // Sequence of phases—runs top-to-bottom; fails fast on error
        stage('Checkout') {  // Pulls your Git code to Jenkins workspace
            steps {
                git branch: 'main',  // Branch to clone
                    url: 'https://github.com/eyuphanpetek/todo-app.git',  // Your repo URL (swap)
                    //credentialsId: 'github-creds'  // Optional: If private repo (add creds in Jenkins)
            }
        }
        stage('Install Dependencies & Test') {  // Validates code (add real tests later)
            steps {
                sh 'npm ci --only=production'  // Clean install (faster than install; prod deps only)
                sh '''
                    # Basic smoke test: Ping Redis + API health
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
                    echo 'API smoke test: curl /api/todos (if app running)'
                '''  // Multi-line shell—could expand to full Mocha/Jest suite
            }
        }
        stage('Build Docker Image') {  // Creates your app image
            steps {
                script {  // Groovy script block—for Docker DSL
                    def image = docker.build("${DOCKER_HUB_REPO}:${DOCKER_TAG}")  // Builds from your Dockerfile
                    // Push to Hub (optional—skip if local-only)
                    docker.withRegistry('https://index.docker.io/v1/', DOCKER_CREDENTIALS_ID) {
                        image.push("${DOCKER_TAG}")
                        image.push('latest')  // Overwrites 'latest' tag
                    }
                    echo "Built & pushed ${DOCKER_HUB_REPO}:${DOCKER_TAG}"
                }
            }
        }
        stage('Deploy to Compose') {  // Automates local run + verify
            steps {
                sh '''
                    cd $WORKSPACE  # Jenkins workspace has your cloned code
                    docker compose down --remove-orphans --volumes  # Clean old (nukes Redis data—add --volumes=false to persist)
                    docker compose up -d --build --scale app=2  # Deploy detached, rebuild, scale to 2 replicas for fun
                    sleep 15  # Wait for startup (tune if Redis slow)
                    # Health checks—fail pipeline if any flop
                    curl -f http://localhost:3000/ || exit 1  # Frontend loads
                    curl -f http://localhost:3000/api/todos || exit 1  # API responds
                    curl -f -X POST http://localhost:3000/api/todos -H "Content-Type: application/json" -d '{"text": "Jenkins deploy test"}' || exit 1  # POST works
                    echo "Deploy successful—app live with test todo!"
                '''
            }
        }
    }

    post {  // Runs after stages (always/success/failure)—cleanup + notify
        always {
            cleanWs()  // Wipes workspace (frees space; re-clones next build)
            sh 'docker system prune -f --volumes'  # Nukes dangling images/volumes (safe, but --volumes wipes Redis—omit if persisting)
        }
        success {
            echo '🚀 Pipeline nailed! Check http://localhost:3000 for your deployed app'
            // Optional: Slack/Email—add plugin + emailext config
        }
        failure {
            echo '💥 Pipeline failed—review stages above for deets'
            // emailext to: 'your.email@example.com', subject: "Build #${BUILD_NUMBER} Failed", body: "Logs: ${BUILD_URL}"
        }
        unstable {
            echo '⚠️ Pipeline unstable (e.g., warnings)—investigate'
        }
    }
}