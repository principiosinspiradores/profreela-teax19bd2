migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.resetPasswordTemplate = {
      subject: 'Redefina sua senha — ProFreela',
      body:
        '<section style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; background: #f6f7f9; color: #111827; margin: 0; padding: 24px;">\n' +
        '  <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb;">\n' +
        '    <h1 style="font-size: 20px; font-weight: 700; color: #0D4F5C; margin: 0 0 12px;">Redefinição de senha</h1>\n' +
        '    <p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px; color: #374151;">Recebemos uma solicitação para redefinir sua senha na plataforma ProFreela. Clique no botão abaixo para definir sua nova senha:</p>\n' +
        '    <p style="text-align: center; margin: 24px 0;">\n' +
        '      <a class="btn" style="display: inline-block; background: #0D4F5C; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600;" href="https://www.profreela.com.br/reset-password?token={TOKEN}" target="_blank" rel="noopener">Redefinir senha</a>\n' +
        '    </p>\n' +
        '    <p style="font-size: 13px; line-height: 1.5; color: #6b7280; margin: 0 0 8px;">Se você não solicitou a redefinição de senha, ignore este e-mail — sua senha atual continuará a mesma.</p>\n' +
        '    <p style="font-size: 12px; color: #9ca3af; margin: 16px 0 0; border-top: 1px solid #f3f4f6; padding-top: 12px;">Equipe ProFreela</p>\n' +
        '  </div>\n' +
        '</section>',
    }
    app.save(users)
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      users.resetPasswordTemplate = {
        subject: 'Reset your {APP_NAME} password',
        body:
          '<p>Hello,</p>\n' +
          '<p>Click on the button below to reset your password.</p>\n' +
          '<p>\n' +
          '  <a class="btn" href="{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}" target="_blank" rel="noopener">Reset password</a>\n' +
          '</p>\n' +
          "<p><i>If you didn't ask to reset your password, please ignore this email.</i></p>\n" +
          '<p>\n' +
          '  Thanks,<br/>\n' +
          '  {APP_NAME} team\n' +
          '</p>',
      }
      app.save(users)
    } catch (_) {}
  },
)
