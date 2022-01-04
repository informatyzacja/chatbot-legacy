const { execSync } = require('child_process');

exports.handler = async (event, context) => {
    execSync('git --version && git clone https://github.com/informatyzacja-sspwr-projekty/Chatbot && cd Chatbot && git checkout development && git status', { stdio: [0, 1, 2] });
}
