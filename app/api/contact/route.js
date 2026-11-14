import axios from 'axios';
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { personalData } from '@/utils/data/personal-data';

// Determine destination/sender email address (env variable or fallback to public personalData.email)
const getTargetEmail = () => (process.env.EMAIL_ADDRESS || personalData.email)?.trim();

// Helper function to create Nodemailer transporter
function getTransporter() {
  const user = getTargetEmail();
  const pass = process.env.GMAIL_PASSKEY?.replace(/\s+/g, '');

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user,
      pass,
    },
  });
}

// Helper function to send a message via Telegram
async function sendTelegramMessage(token, chat_id, message) {
  if (!token || !chat_id) return false;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await axios.post(url, {
      text: message,
      chat_id,
    });
    return res.data.ok;
  } catch (error) {
    console.error('Error sending Telegram message:', error.response?.data || error.message);
    return false;
  }
}

// HTML email template
const generateEmailTemplate = (name, email, userMessage) => `
  <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; background-color: #f4f4f4;">
    <div style="max-width: 600px; margin: auto; background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);">
      <h2 style="color: #007BFF; margin-top: 0;">New Message Received from Portfolio</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
      <p><strong>Message:</strong></p>
      <blockquote style="border-left: 4px solid #007BFF; padding-left: 12px; margin-left: 0; color: #555; white-space: pre-wrap;">
        ${userMessage}
      </blockquote>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #888; margin-bottom: 0;">Click reply in your email client to respond directly to ${name} (${email}).</p>
    </div>
  </div>
`;

// Helper function to send an email via Nodemailer
async function sendEmail(payload, message) {
  const { name, email, message: userMessage } = payload;
  const transporter = getTransporter();

  if (!transporter) {
    console.error('Email credentials not configured (EMAIL_ADDRESS or GMAIL_PASSKEY missing).');
    return false;
  }

  const targetEmail = getTargetEmail();
  const mailOptions = {
    from: `"Portfolio Contact Form" <${targetEmail}>`,
    to: targetEmail,
    subject: `New Portfolio Message From ${name}`,
    text: message,
    html: generateEmailTemplate(name, email, userMessage),
    replyTo: email,
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error while sending email:', error.message);
    return false;
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const { name, email, message: userMessage } = payload;

    if (!name || !email || !userMessage) {
      return NextResponse.json(
        {
          success: false,
          message: 'All fields (name, email, message) are required.',
        },
        { status: 400 }
      );
    }

    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chat_id = process.env.TELEGRAM_CHAT_ID?.trim();
    const targetEmail = getTargetEmail();
    const hasEmailConfig = Boolean(targetEmail && process.env.GMAIL_PASSKEY);
    const hasTelegramConfig = Boolean(token && chat_id);

    if (!hasEmailConfig && !hasTelegramConfig) {
      return NextResponse.json(
        {
          success: false,
          message: 'Contact service is not configured on the server.',
        },
        { status: 500 }
      );
    }

    const formattedMessage = `New message from ${name}\n\nEmail: ${email}\n\nMessage:\n\n${userMessage}\n\n`;

    let emailSuccess = false;
    let telegramSuccess = false;

    // Send email if configured
    if (hasEmailConfig) {
      emailSuccess = await sendEmail(payload, formattedMessage);
    }

    // Send telegram message if configured
    if (hasTelegramConfig) {
      telegramSuccess = await sendTelegramMessage(token, chat_id, formattedMessage);
    }

    // Success if at least one delivery channel succeeded
    if (emailSuccess || telegramSuccess) {
      return NextResponse.json(
        {
          success: true,
          message: 'Message sent successfully!',
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to send message. Please try again later or reach out directly via email.',
      },
      { status: 500 }
    );
  } catch (error) {
    console.error('API Error:', error.message);
    return NextResponse.json(
      {
        success: false,
        message: 'Server error occurred while sending your message.',
      },
      { status: 500 }
    );
  }
}