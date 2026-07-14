const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_USER/GMAIL_APP_PASSWORD 환경변수가 설정되지 않았습니다.');
  }
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return transporter;
}

async function sendVerificationCode(to, code) {
  await getTransporter().sendMail({
    from: `"별 강화하기" <${process.env.GMAIL_USER}>`,
    to,
    subject: '[별 강화하기] 이메일 인증 코드',
    text: `인증 코드: ${code}\n\n10분 이내에 회원가입 화면에 입력해주세요.`,
    html: `<p>인증 코드: <b style="font-size:1.3em;letter-spacing:0.1em;">${code}</b></p><p>10분 이내에 회원가입 화면에 입력해주세요.</p>`,
  });
}

module.exports = { sendVerificationCode };
