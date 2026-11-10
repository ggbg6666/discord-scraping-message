const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'node_modules', 'discord.js-selfbot-v13', 'src', 'managers', 'ClientUserSettingManager.js');
if (!fs.existsSync(file)) process.exit(0);
let content = fs.readFileSync(file, 'utf8');
const search = '_patch(data) {';
const replace = '_patch(data) {\n    if (!this.user || !this.user.settings) return;';
if (content.includes(search) && !content.includes('if (!this.user || !this.user.settings) return;')) {
  content = content.replace(search, replace);
  fs.writeFileSync(file, content, 'utf8');
}