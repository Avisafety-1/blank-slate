// English default e-mail templates. Same structure and template variables as the
// Norwegian ones in template-utils.ts – must be kept in sync when new variables
// are introduced. See mem://preferences/i18n-mandatory.

export const defaultTemplatesEn: Record<string, { subject: string; content: string }> = {
  password_reset: {
    subject: "Reset your password – AviSafe",
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.button { display: inline-block; background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
.warning { background: #fef3c7; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #f59e0b; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Reset your password</h1>
</div>
<div class="content">
<p>Hi {{user_name}},</p>
<p>We received a request to reset your password. Click the button below to continue:</p>
<a href="{{reset_link}}" class="button">Reset password</a>
<div class="warning">
<p><strong>Important:</strong> This link expires in 1 hour for security reasons.</p>
</div>
<p>If you did not request a password reset, you can safely ignore this email.</p>
<p>Best regards,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,
  },

  admin_new_user: {
    subject: "New user awaiting approval",
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.user-info { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #1e40af; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>New user awaiting approval</h1>
</div>
<div class="content">
<p>A new user has signed up and is awaiting approval.</p>
<div class="user-info">
<p><strong>Name:</strong> {{new_user_name}}</p>
<p><strong>Email:</strong> {{new_user_email}}</p>
<p><strong>Company:</strong> {{company_name}}</p>
</div>
<p style="margin-top: 20px;">Log in to AviSafe to approve or reject this user.</p>
</div>
</div>
</body>
</html>`,
  },

  incident_notification: {
    subject: "New incident: {{incident_title}}",
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.incident-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; }
.severity { display: inline-block; padding: 4px 12px; border-radius: 4px; color: white; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>New incident reported</h1>
</div>
<div class="content">
<div class="incident-box">
<h2 style="margin-top: 0;">{{incident_title}}</h2>
<p><strong>Severity:</strong> <span class="severity" style="background: #f59e0b;">{{incident_severity}}</span></p>
<p><strong>Location:</strong> {{incident_location}}</p>
<p><strong>Description:</strong></p>
<p>{{incident_description}}</p>
</div>
<p>Log in to AviSafe to see details and follow up on the incident.</p>
<p>Best regards,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,
  },

  mission_notification: {
    subject: "New mission: {{mission_title}}",
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.mission-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>New mission scheduled</h1>
</div>
<div class="content">
<div class="mission-box">
<h2 style="margin-top: 0;">{{mission_title}}</h2>
<table style="width: 100%;">
<tr><td style="padding: 8px 0; color: #666;"><strong>Status:</strong></td><td>{{mission_status}}</td></tr>
<tr><td style="padding: 8px 0; color: #666;"><strong>Location:</strong></td><td>{{mission_location}}</td></tr>
<tr><td style="padding: 8px 0; color: #666;"><strong>Time:</strong></td><td>{{mission_date}}</td></tr>
</table>
<p style="margin-top: 15px;"><strong>Description:</strong></p>
<p>{{mission_description}}</p>
</div>
<p>Log in to AviSafe for more information.</p>
<p>Best regards,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,
  },

  user_welcome: {
    subject: "Welcome to {{company_name}}",
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Welcome to {{company_name}}!</h1>
</div>
<div class="content">
<p>Hi {{user_name}},</p>
<p>Welcome as a user at {{company_name}}. Your account has been created and is awaiting approval from an administrator.</p>
<p>You will receive an email once your account is approved.</p>
<p>Best regards,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,
  },

  followup_assigned: {
    subject: "You have been assigned as follow-up owner: {{incident_title}}",
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.incident-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f59e0b; }
.severity { display: inline-block; padding: 4px 12px; border-radius: 4px; color: white; background: #f59e0b; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Follow-up owner assigned</h1>
</div>
<div class="content">
<p>Hi {{user_name}},</p>
<p>You have been assigned as follow-up owner for the following incident:</p>
<div class="incident-box">
<h2 style="margin-top: 0;">{{incident_title}}</h2>
<p><strong>Severity:</strong> <span class="severity">{{incident_severity}}</span></p>
<p><strong>Location:</strong> {{incident_location}}</p>
<p><strong>Description:</strong></p>
<p>{{incident_description}}</p>
</div>
<p>Log in to AviSafe to see details and follow up on the incident.</p>
<p>Best regards,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,
  },

  user_approved: {
    subject: "Your account has been approved – {{company_name}}",
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.success-icon { font-size: 48px; margin-bottom: 15px; }
.button { display: inline-block; background: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
.footer { text-align: center; margin-top: 20px; font-size: 12px; color: #888; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<div class="success-icon">✓</div>
<h1 style="margin: 0;">Welcome to {{company_name}}!</h1>
</div>
<div class="content">
<h2>Hi {{user_name}}!</h2>
<p>We are pleased to inform you that your user account at <strong>{{company_name}}</strong> has been approved.</p>
<p>You now have full access to the system and can start using all the features available to you.</p>
<p style="text-align: center;">
<a href="https://app.avisafe.no" class="button">Log in now</a>
</p>
<p>If you have any questions or need help getting started, please don't hesitate to contact us.</p>
<p>Best regards,<br>{{company_name}}</p>
<div class="footer">
<p>This is an automated email from AviSafe.</p>
</div>
</div>
</div>
</body>
</html>`,
  },

  customer_welcome: {
    subject: "Welcome as a customer at {{company_name}}",
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.welcome-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6; }
.footer { text-align: center; margin-top: 20px; font-size: 12px; color: #888; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1 style="margin: 0;">Welcome as a customer!</h1>
</div>
<div class="content">
<h2>Hi {{customer_name}}!</h2>
<p>We are pleased to welcome you as a customer at <strong>{{company_name}}</strong>.</p>
<div class="welcome-box">
<p style="margin: 0;">You are now registered in our system. We look forward to a good collaboration and will do our best to deliver high-quality services.</p>
</div>
<p>If you have any questions or need more information, please feel free to contact us.</p>
<p>Best regards,<br>{{company_name}}</p>
<div class="footer">
<p>This is an automated email from AviSafe.</p>
</div>
</div>
</div>
</body>
</html>`,
  },

  mission_confirmation: {
    subject: "Mission confirmation: {{mission_title}}",
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.mission-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; }
.detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
.detail-row:last-child { border-bottom: none; }
.label { color: #666; font-weight: bold; }
.status { display: inline-block; padding: 4px 12px; border-radius: 4px; background: #dbeafe; color: #1e40af; font-weight: bold; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Mission confirmation</h1>
</div>
<div class="content">
<p>This confirms the following mission:</p>
<div class="mission-box">
<h2 style="margin-top: 0; color: #1e40af;">{{mission_title}}</h2>
<div class="detail-row">
<span class="label">Status:</span> <span class="status">{{mission_status}}</span>
</div>
<div class="detail-row">
<span class="label">Location:</span> {{mission_location}}
</div>
<div class="detail-row">
<span class="label">Time:</span> {{mission_date}}
</div>
</div>
<p>Log in to AviSafe for more information and details about the mission.</p>
<p>Best regards,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,
  },

  document_reminder: {
    subject: "Document expiring soon: {{document_title}}",
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.warning-icon { font-size: 48px; margin-bottom: 15px; }
.document-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444; }
.expiry-date { color: #dc2626; font-weight: bold; font-size: 18px; }
.button { display: inline-block; background: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<div class="warning-icon">⚠️</div>
<h1 style="margin: 0;">Document expiring soon</h1>
</div>
<div class="content">
<p>This is a reminder that the following document is expiring soon:</p>
<div class="document-box">
<h2 style="margin-top: 0;">{{document_title}}</h2>
<p><strong>Expiry date:</strong> <span class="expiry-date">{{expiry_date}}</span></p>
</div>
<p>We recommend that you renew or update this document as soon as possible to avoid operational disruptions.</p>
<p style="text-align: center;">
<a href="https://app.avisafe.no" class="button">Go to documents</a>
</p>
<p>Best regards,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,
  },

  mission_approved: {
    subject: "Mission approved: {{mission_title}}",
    content: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.mission-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #059669; }
.comments-box { background: #fffbeb; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #f59e0b; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1 style="margin: 0;">Mission approved</h1>
</div>
<div class="content">
<div class="mission-box">
<h2 style="margin-top: 0;">{{mission_title}}</h2>
<p><strong>Location:</strong> {{mission_location}}</p>
<p><strong>Time:</strong> {{mission_date}}</p>
</div>
{{comments_section}}
<p>Log in to the app to see the mission.</p>
</div>
</div>
</body>
</html>`,
  },

  mission_approval_request: {
    subject: "Mission awaiting approval: {{mission_title}}",
    content: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.mission-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f59e0b; }
.pending-icon { font-size: 48px; margin-bottom: 15px; }
.button { display: inline-block; background: #f59e0b; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<div class="pending-icon">⏳</div>
<h1 style="margin: 0;">Mission awaiting approval</h1>
</div>
<div class="content">
<p>A mission has been submitted for approval and is awaiting your review.</p>
<div class="mission-box">
<h2 style="margin-top: 0;">{{mission_title}}</h2>
<p><strong>Location:</strong> {{mission_location}}</p>
<p><strong>Time:</strong> {{mission_date}}</p>
<p><strong>Description:</strong> {{mission_description}}</p>
</div>
<p style="text-align: center;">
<a href="https://app.avisafe.no" class="button">Go to approval</a>
</p>
<p>Best regards,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,
  },

  pilot_comment_notification: {
    subject: "Comment on mission: {{mission_title}}",
    content: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.comment-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #3b82f6; }
.mission-info { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
.button { display: inline-block; background: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1 style="margin: 0;">Comment on mission</h1>
</div>
<div class="content">
<p>You have received a comment from <strong>{{sender_name}}</strong> regarding the following mission:</p>
<div class="mission-info">
<h2 style="margin-top: 0; color: #1e40af;">{{mission_title}}</h2>
<p><strong>Location:</strong> {{mission_location}}</p>
<p><strong>Time:</strong> {{mission_date}}</p>
</div>
<div class="comment-box">
<p style="margin: 0;"><strong>Comment:</strong></p>
<p style="margin: 5px 0 0 0;">{{comment}}</p>
</div>
<p style="text-align: center;">
<a href="https://app.avisafe.no" class="button">Go to mission</a>
</p>
</div>
</div>
</body>
</html>`,
  },

  mission_mention_notification: {
    subject: "You have been mentioned in a mission: {{mission_title}}",
    content: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.mission-info { background: white; padding: 18px; border-radius: 8px; margin: 16px 0; border: 1px solid #e5e7eb; }
.note-box { background: white; padding: 20px; border-radius: 8px; margin: 18px 0; border-left: 4px solid #3b82f6; }
.button { display: inline-block; background: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1 style="margin: 0;">You have been mentioned in a mission</h1>
</div>
<div class="content">
<p>Hi {{user_name}},</p>
<p><strong>{{sender_name}}</strong> has mentioned you in notes on a mission in AviSafe.</p>
<div class="mission-info">
<h2 style="margin-top: 0; color: #1e40af;">{{mission_title}}</h2>
<p><strong>Location:</strong> {{mission_location}}</p>
<p><strong>Time:</strong> {{mission_date}}</p>
</div>
<div class="note-box">
<p style="margin: 0 0 8px 0;"><strong>Note:</strong></p>
<p style="margin: 0;">{{mission_note}}</p>
</div>
<p>Log in to the app to see the mission, route, resources, and other context.</p>
<p style="text-align: center;">
<a href="{{app_url}}" class="button">Open mission in AviSafe</a>
</p>
<p>Best regards,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,
  },

  maintenance_reminder: {
    subject: "Maintenance reminder: {{item_count}} resources require attention",
    content: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.tool-icon { font-size: 48px; margin-bottom: 15px; }
.items-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb; }
.items-list { white-space: pre-line; font-family: monospace; background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 15px 0; }
.count-badge { display: inline-block; background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 20px; font-weight: bold; }
.button { display: inline-block; background: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<div class="tool-icon">🔧</div>
<h1 style="margin: 0;">Maintenance reminder</h1>
</div>
<div class="content">
<p>Hi {{user_name}},</p>
<p>The following resources have maintenance or inspection due soon:</p>
<div class="items-box">
<p><span class="count-badge">{{item_count}} resources</span></p>
<div class="items-list">{{items_list}}</div>
</div>
<p>We recommend that you schedule the required maintenance to ensure the equipment stays in optimal condition.</p>
<p style="text-align: center;">
<a href="https://app.avisafe.no" class="button">Go to resources</a>
</p>
<p>Best regards,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,
  },

  user_invite: {
    subject: "You have been invited to {{company_name}}",
    content: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.code-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px dashed #3b82f6; text-align: center; }
.code { font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #1e40af; }
.steps { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
.step { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
.step:last-child { border-bottom: none; }
.step-number { display: inline-block; background: #1e40af; color: white; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: bold; margin-right: 10px; }
.button { display: inline-block; background: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
.footer { text-align: center; margin-top: 20px; font-size: 12px; color: #888; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1 style="margin: 0;">You are invited!</h1>
</div>
<div class="content">
<p>Hi!</p>
<p>You have been invited to join <strong>{{company_name}}</strong>'s drone operations system.</p>
<div class="code-box">
<p style="margin: 0 0 10px 0; color: #666;">Your registration code:</p>
<div class="code">{{registration_code}}</div>
</div>
<div class="steps">
<p style="margin-top: 0;"><strong>How to get started:</strong></p>
<div class="step"><span class="step-number">1</span> Go to <a href="{{app_url}}">{{app_url}}</a></div>
<div class="step"><span class="step-number">2</span> Click "Create account"</div>
<div class="step"><span class="step-number">3</span> Enter the registration code above</div>
<div class="step"><span class="step-number">4</span> Fill in name, email, and password</div>
</div>
<p style="text-align: center;">
<a href="{{app_url}}" class="button">Go to AviSafe</a>
</p>
<p>Best regards,<br>{{company_name}}</p>
<div class="footer">
<p>This is an automated email from AviSafe.</p>
</div>
</div>
</div>
</body>
</html>`,
  },
};
