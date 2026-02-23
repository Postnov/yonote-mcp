/**
 * Auth client — login, logout, session check, setup, password change.
 * Cookies are sent automatically by the browser (credentials: 'same-origin').
 */
export class AuthClient {
    /**
     * Check current session.
     * @returns {{user: {id, email, name, role}}|{error, needs_setup}}
     */
    async check() {
        const resp = await fetch('api/auth.php', { credentials: 'same-origin' });
        const data = await resp.json();
        if (!resp.ok) return { error: data.error, needs_setup: data.needs_setup || false };
        return data;
    }

    /**
     * Login with email + password.
     * @returns {{token, user}|{error}}
     */
    async login(email, password) {
        const resp = await fetch('api/auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ action: 'login', email, password }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Login failed');
        return data;
    }

    /**
     * Logout — clear session.
     */
    async logout() {
        await fetch('api/auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ action: 'logout' }),
        });
    }

    /**
     * First-time setup — create admin account.
     * @returns {{token, user}}
     */
    async setup(email, password, name) {
        const resp = await fetch('api/auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ action: 'setup', email, password, name }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Setup failed');
        return data;
    }

    /**
     * Change current user's password.
     */
    async changePassword(currentPassword, newPassword) {
        const resp = await fetch('api/auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ action: 'change_password', current_password: currentPassword, new_password: newPassword }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Password change failed');
        return data;
    }
}
