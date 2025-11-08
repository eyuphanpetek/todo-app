pipeline {  // Top-level declarative pipeline

    agent any  // Runs on any available agent (your Jenkins container)

    environment {  // Global environment variables
        DOCKER_HUB_REPO = 'mrzinister/todo-app'  // Your Docker Hub repo
        DOCKER_TAG = "${BUILD_NUMBER}"  // Auto-tags with build number
        DOCKER_CREDENTIALS_ID = 'dockerhub-creds'  // Jenkins credential ID for push
    }

    stages {  // Main workflow stages
        stage('Checkout') {  // Clones Git repo to workspace
            steps {
                git branch: 'main', url: 'https://github.com/eyuphanpetek/todo-app.git'
                // credentialsId: 'github-creds'  // Uncomment if private
            }
        }

        stage('Install Dependencies & Test') {  // Validates code and runs tests
            steps {
                // FIXED: NVM-based Node install (no apt repo/GPG issues—direct curl)
                sh '''
                    if ! command -v node > /dev/null; then
                        echo "Installing Node.js 20 via NVM as root..."
                        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
                        export NVM_DIR="$HOME/.nvm"
                        [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"  # Load NVM
                        nvm install 20
                        nvm use 20
                    fi
                    node --version  # Verify
                    npm --version  # Verify npm
                '''
                sh 'npm ci --only=production'  // Deterministic install
                sh '''
                    # Smoke test: Redis connect
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
                    echo 'Basic tests passed'
                '''
            }
        }

        stage('Build Docker Image') {  // Builds and pushes image
            steps {
                script {
                    def image = docker.build("${env.DOCKER_HUB_REPO}:${env.DOCKER_TAG}")
                    docker.withRegistry('https://index.docker.io/v1/', env.DOCKER_CREDENTIALS_ID) {
                        image.push("${env.DOCKER_TAG}")
                        image.push('latest')
                    }
                    echo "Built & pushed ${env.DOCKER_HUB_REPO}:${env.DOCKER_TAG}"
                }
            }
        }

        stage('Deploy to Compose') {  // Deploys and verifies
            steps {
                sh '''
                    cd $WORKSPACE
                    docker compose down --remove-orphans --volumes
                    docker compose up -d --build --scale app=2
                    sleep 20
                    curl -f http://localhost:3000/ || exit 1
                    curl -f http://localhost:3000/api/todos || exit 1
                    curl -f -X POST http://localhost:3000/api/todos \\
                         -H "Content-Type: application/json" \\
                         -d \'{"text": "Jenkins deploy test"}\' || exit 1
                    echo "Deploy successful—app live!"
                '''
            }
        }
    }

    post {
        always {
            cleanWs()
            sh 'docker system prune -f --volumes'  // CLI + socket operational
        }
        success {
            echo '🚀 Pipeline nailed! App at http://localhost:3000'
        }
        failure {
            echo '💥 Pipeline failed—check stages'
        }
        unstable {
            echo '⚠️ Pipeline unstable'
        }
    }
}