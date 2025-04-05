import { Client } from 'ssh2';
import fetch from 'node-fetch';

const USERNAME = process.env.BASIC_AUTH_USERNAME;
const PASSWORD = process.env.BASIC_AUTH_PASSWORD;
const CRON_SECRET = process.env.CRON_SECRET;
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    if (authHeader.substring(7) === CRON_SECRET) {
      return handleRequest(req, res);
    } else {
      return res.status(401).send('Unauthorized');
    }
  }

  if (validateBasicAuth(req.headers['authorization'])) {
    return handleRequest(req, res);
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
  return res.status(401).send('Authentication required');
}

function validateBasicAuth(authHeader) {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');

  return username === USERNAME && password === PASSWORD;
}

async function handleRequest(req, res) {
  const accounts = [];
  let index = 1;
  while (process.env[`HOST${index}`]) {
    accounts.push({
      host: process.env[`HOST${index}`],
      username: process.env[`USERNAME${index}`],
      password: process.env[`PASSWORD${index}`]
    });
    index++;
  }

  // 处理每个账户
  let result = 'success';
  for (const account of accounts) {
    try {
      await sshConnect(account);
    } catch (error) {
      result = 'failed';
      break;
    }
  }

  res.status(200).send(result);
}

async function sshConnect(account) {
  const { host, username, password } = account;

  const conn = new Client();

  return new Promise((resolve, reject) => {
    conn.on('ready', async () => {
      console.log(`SSH 连接成功: ${username}@${host}`);

      // 推送成功消息
      await sendTelegramMessage(
        `✅ Serv00 自动登录成功\n账号: ${username}\n主机: ${host}\nSSH 连接成功。`
      );

      conn.end();
      resolve();
    }).on('error', async (err) => {
      console.error(`SSH 连接失败: ${err}`);

      // 推送失败消息
      await sendTelegramMessage(
        `❌ Serv00 自动登录失败\n账号: ${username}\n主机: ${host}\nSSH 连接失败，请检查账号和密码是否正确。`
      );

      reject(err);
    }).on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
      console.log(`Keyboard-interactive authentication requested: ${name}, ${instructions}`);
      finish([password]);
    }).on('change password', (message, lang, done) => {
      console.log(`Change password requested: ${message}`);
      done();
    }).connect({
      host: host,
      port: 22,
      username: username,
      password: password,
      tryKeyboard: true
    });
  });
}

async function sendTelegramMessage(message) {
  const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: TG_CHAT_ID,
    text: message,
    parse_mode: 'Markdown'
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('Telegram 推送失败:', await response.text());
    }
  } catch (error) {
    console.error('发送 Telegram 消息时发生错误:', error);
  }
}
