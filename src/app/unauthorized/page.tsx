export default function UnauthorizedPage() {
  return <main className="auth-page"><section className="auth-form-side auth-denied"><div className="auth-form-card"><span className="auth-eyebrow">ACCESS RESTRICTED</span><h2>This workspace is private.</h2><p>The signed-in account is not the configured workspace owner.</p><form method="post" action="/auth/signout"><button className="button button-primary" type="submit">Return to sign in</button></form></div></section></main>;
}
