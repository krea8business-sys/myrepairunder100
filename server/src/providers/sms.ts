import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/** SMS / OTP delivery. Add WhatsApp/other providers by implementing this interface. */
export interface SmsProvider { name: string; sendOtp(phoneE164: string, code: string): Promise<void>; sendText(phoneE164: string, text: string): Promise<void> }

/** MOCK — local development only. Prints OTPs to the server log. Refused in production by env.ts. */
const mock: SmsProvider = {
  name: 'mock',
  async sendOtp(phone, code) { logger.warn({ phone }, `[MOCK SMS] OTP for ${phone}: ${code}`); },
  async sendText(phone, text) { logger.info({ phone }, `[MOCK SMS] ${text}`); },
};

const msg91: SmsProvider = {
  name: 'msg91',
  async sendOtp(phone, code) {
    const r = await fetch('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: { authkey: env.MSG91_AUTH_KEY!, 'content-type': 'application/json' },
      body: JSON.stringify({ template_id: env.MSG91_TEMPLATE_ID, recipients: [{ mobiles: phone.replace('+', ''), otp: code }] }),
    });
    if (!r.ok) throw new Error(`MSG91 error ${r.status}`);
  },
  async sendText() { /* configure a DLT-approved flow template for transactional SMS */ },
};

const twilio: SmsProvider = {
  name: 'twilio',
  async sendOtp(phone, code) { await this.sendText(phone, `${code} is your MyRepairUnder100 login code. Valid for 5 minutes. Do not share it.`); },
  async sendText(phone, text) {
    const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST', headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: phone, From: env.TWILIO_FROM!, Body: text }),
    });
    if (!r.ok) throw new Error(`Twilio error ${r.status}`);
  },
};

export const sms: SmsProvider = env.SMS_PROVIDER === 'msg91' ? msg91 : env.SMS_PROVIDER === 'twilio' ? twilio : mock;
