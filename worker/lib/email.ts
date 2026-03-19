import { Resend } from 'resend'
import type { Environment } from '../environment'

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

export function renderInviteEmailHtml(opts: {
	ownerName: string
	permission: 'view' | 'edit'
	roomSlug: string
}): string {
	const permissionText =
		opts.permission === 'edit'
			? 'You can view and edit this session.'
			: 'You can view this session.'
	const link = `https://iris.yinflow.life/r/${escapeHtml(opts.roomSlug)}`

	return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="padding:40px 40px 20px;">
  <h1 style="margin:0;color:#18181b;font-size:24px;">You're invited</h1>
  <p style="color:#52525b;font-size:16px;line-height:1.6;">
    ${escapeHtml(opts.ownerName)} has invited you to their Yinflow session.
  </p>
  <p style="color:#52525b;font-size:14px;">${permissionText}</p>
  <a href="${link}"
     style="display:inline-block;background:#6366f1;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0;">
    Join Session
  </a>
</td></tr>
<tr><td style="padding:20px 40px 40px;">
  <p style="color:#a1a1aa;font-size:13px;margin:0;">
    If you didn't expect this email, you can safely ignore it.
  </p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

export async function sendInviteEmail(
	env: Environment,
	opts: {
		ownerName: string
		ownerEmail: string
		recipientEmail: string
		permission: 'view' | 'edit'
		roomSlug: string
	},
): Promise<{ success: boolean; error?: string }> {
	if (!env.RESEND_API_KEY) {
		console.warn('RESEND_API_KEY not set, skipping invite email')
		return { success: false, error: 'API key not configured' }
	}

	const resend = new Resend(env.RESEND_API_KEY)
	const html = renderInviteEmailHtml(opts)

	const { error } = await resend.emails.send({
		from: 'Iris <noreply@yinflow.life>',
		to: opts.recipientEmail,
		subject: `${opts.ownerName} invited you to a Yinflow session`,
		html,
	})

	if (error) {
		console.error('Resend error:', error)
		return { success: false, error: error.message }
	}
	return { success: true }
}
