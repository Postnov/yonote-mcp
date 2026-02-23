/**
 * Tests for the authentication system — AuthClient, UserApi,
 * UI login/setup/admin views, role-based project rendering.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- AuthClient tests ---

describe('AuthClient', () => {
    let AuthClient;

    beforeEach(async () => {
        global.fetch = vi.fn();
        const mod = await import('../js/auth.js');
        AuthClient = mod.AuthClient;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('check()', () => {
        it('returns user when session is valid', async () => {
            const user = { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' };
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ user }),
            });

            const client = new AuthClient();
            const result = await client.check();
            expect(result.user).toEqual(user);
            expect(global.fetch).toHaveBeenCalledWith('/api/auth.php', { credentials: 'same-origin' });
        });

        it('returns error and needs_setup when no session', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                json: () => Promise.resolve({ error: 'Not authenticated', needs_setup: true }),
            });

            const client = new AuthClient();
            const result = await client.check();
            expect(result.error).toBe('Not authenticated');
            expect(result.needs_setup).toBe(true);
        });

        it('returns needs_setup false when users exist but no session', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                json: () => Promise.resolve({ error: 'Not authenticated', needs_setup: false }),
            });

            const client = new AuthClient();
            const result = await client.check();
            expect(result.needs_setup).toBe(false);
        });
    });

    describe('login()', () => {
        it('sends email and password, returns token and user', async () => {
            const resp = { token: 'abc123', user: { id: 1, email: 'a@b.com', name: '', role: 'admin' } };
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(resp),
            });

            const client = new AuthClient();
            const result = await client.login('a@b.com', 'pass123');
            expect(result.token).toBe('abc123');
            expect(result.user.email).toBe('a@b.com');

            expect(global.fetch).toHaveBeenCalledWith('/api/auth.php', expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ action: 'login', email: 'a@b.com', password: 'pass123' }),
            }));
        });

        it('throws on invalid credentials', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                json: () => Promise.resolve({ error: 'Invalid email or password' }),
            });

            const client = new AuthClient();
            await expect(client.login('a@b.com', 'wrong')).rejects.toThrow('Invalid email or password');
        });
    });

    describe('logout()', () => {
        it('sends logout action', async () => {
            global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) });

            const client = new AuthClient();
            await client.logout();

            expect(global.fetch).toHaveBeenCalledWith('/api/auth.php', expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ action: 'logout' }),
            }));
        });
    });

    describe('setup()', () => {
        it('creates first admin account', async () => {
            const resp = { token: 'tok', user: { id: 1, email: 'a@b.com', name: 'Admin', role: 'admin' } };
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(resp),
            });

            const client = new AuthClient();
            const result = await client.setup('a@b.com', 'pass123', 'Admin');
            expect(result.user.role).toBe('admin');
            expect(result.token).toBe('tok');

            expect(global.fetch).toHaveBeenCalledWith('/api/auth.php', expect.objectContaining({
                body: JSON.stringify({ action: 'setup', email: 'a@b.com', password: 'pass123', name: 'Admin' }),
            }));
        });

        it('throws when setup already completed', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                json: () => Promise.resolve({ error: 'Setup already completed' }),
            });

            const client = new AuthClient();
            await expect(client.setup('a@b.com', 'pass', 'N')).rejects.toThrow('Setup already completed');
        });
    });

    describe('changePassword()', () => {
        it('sends current and new password', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ ok: true }),
            });

            const client = new AuthClient();
            await client.changePassword('old123', 'new456');

            expect(global.fetch).toHaveBeenCalledWith('/api/auth.php', expect.objectContaining({
                body: JSON.stringify({ action: 'change_password', current_password: 'old123', new_password: 'new456' }),
            }));
        });

        it('throws on wrong current password', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                json: () => Promise.resolve({ error: 'Current password is incorrect' }),
            });

            const client = new AuthClient();
            await expect(client.changePassword('wrong', 'new456')).rejects.toThrow('Current password is incorrect');
        });
    });
});

// --- UserApi tests ---

describe('UserApi', () => {
    let UserApi;

    beforeEach(async () => {
        global.fetch = vi.fn();
        const mod = await import('../js/user-api.js');
        UserApi = mod.UserApi;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('list()', () => {
        it('fetches all users', async () => {
            const users = [
                { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin', project_ids: [] },
                { id: 2, email: 'user@test.com', name: 'User', role: 'user', project_ids: [1, 2] },
            ];
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(users),
            });

            const api = new UserApi();
            const result = await api.list();
            expect(result).toHaveLength(2);
            expect(result[0].role).toBe('admin');
        });
    });

    describe('get()', () => {
        it('fetches single user by id', async () => {
            const user = { id: 2, email: 'user@test.com', name: 'User', role: 'user', project_ids: [1] };
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(user),
            });

            const api = new UserApi();
            const result = await api.get(2);
            expect(result.id).toBe(2);
            expect(global.fetch).toHaveBeenCalledWith('/api/users.php?id=2', expect.any(Object));
        });
    });

    describe('create()', () => {
        it('sends user data with project_ids', async () => {
            const created = { id: 3, email: 'new@test.com', name: 'New', role: 'user', project_ids: [1] };
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(created),
            });

            const api = new UserApi();
            const result = await api.create({
                email: 'new@test.com',
                name: 'New',
                password: 'pass123',
                project_ids: [1],
            });
            expect(result.id).toBe(3);
            expect(global.fetch).toHaveBeenCalledWith('/api/users.php', expect.objectContaining({
                method: 'POST',
            }));
        });

        it('throws on duplicate email', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                json: () => Promise.resolve({ error: 'User with this email already exists' }),
            });

            const api = new UserApi();
            await expect(api.create({ email: 'dup@test.com', name: '', password: 'p', project_ids: [] }))
                .rejects.toThrow('User with this email already exists');
        });
    });

    describe('update()', () => {
        it('sends PUT with user data', async () => {
            const updated = { id: 2, email: 'user@test.com', name: 'Updated', role: 'user', project_ids: [1, 2] };
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(updated),
            });

            const api = new UserApi();
            const result = await api.update(2, { name: 'Updated', project_ids: [1, 2] });
            expect(result.name).toBe('Updated');
            expect(global.fetch).toHaveBeenCalledWith('/api/users.php?id=2', expect.objectContaining({
                method: 'PUT',
            }));
        });
    });

    describe('delete()', () => {
        it('sends DELETE request', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ ok: true }),
            });

            const api = new UserApi();
            await api.delete(2);
            expect(global.fetch).toHaveBeenCalledWith('/api/users.php?id=2', expect.objectContaining({
                method: 'DELETE',
            }));
        });
    });
});

// --- UI tests ---

describe('UI auth views', () => {
    beforeEach(() => {
        // Set up minimal DOM
        document.body.innerHTML = `
            <div id="viewLogin"></div>
            <div id="viewSetup"></div>
            <div id="viewAdmin"></div>
            <div id="projectsGrid"></div>
        `;
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('showLoginView renders login form', async () => {
        const { showLoginView } = await import('../js/ui.js');
        showLoginView(vi.fn());

        expect(document.getElementById('loginEmail')).toBeTruthy();
        expect(document.getElementById('loginPassword')).toBeTruthy();
        expect(document.getElementById('btnLogin')).toBeTruthy();
    });

    it('showSetupView renders setup form with name field', async () => {
        const { showSetupView } = await import('../js/ui.js');
        showSetupView(vi.fn());

        expect(document.getElementById('setupName')).toBeTruthy();
        expect(document.getElementById('setupEmail')).toBeTruthy();
        expect(document.getElementById('setupPassword')).toBeTruthy();
        expect(document.getElementById('btnSetup')).toBeTruthy();
    });

    it('renderAdminView shows user list with action buttons', async () => {
        const { renderAdminView } = await import('../js/ui.js');
        const users = [
            { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin', project_ids: [] },
            { id: 2, email: 'user@test.com', name: 'User', role: 'user', project_ids: [1] },
        ];
        const projects = [{ id: 1, name: 'Project 1' }];

        renderAdminView(users, projects, { onAdd: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() });

        const rows = document.querySelectorAll('.user-row');
        expect(rows.length).toBe(2);

        // Admin row should NOT have edit/delete buttons
        expect(rows[0].querySelector('.edit-user-btn')).toBeFalsy();
        // User row should have edit/delete
        expect(rows[1].querySelector('.edit-user-btn')).toBeTruthy();
        expect(rows[1].querySelector('.delete-user-btn')).toBeTruthy();
    });

    it('renderProjectsViewWithRole hides edit/delete for non-admin', async () => {
        const { renderProjectsViewWithRole } = await import('../js/ui.js');
        const projects = [{ id: 1, name: 'Test', data: {}, created_at: '2024-01-01' }];

        renderProjectsViewWithRole(projects, 'user', {
            onCreate: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onOpen: vi.fn(),
        });

        const grid = document.getElementById('projectsGrid');
        // No edit/delete buttons for user role
        expect(grid.querySelector('.edit-btn')).toBeFalsy();
        expect(grid.querySelector('.delete-btn')).toBeFalsy();
        // No "new project" card for user role
        expect(grid.querySelector('.project-card-new')).toBeFalsy();
    });

    it('renderProjectsViewWithRole shows edit/delete for admin', async () => {
        const { renderProjectsViewWithRole } = await import('../js/ui.js');
        const projects = [{ id: 1, name: 'Test', data: {}, created_at: '2024-01-01' }];

        renderProjectsViewWithRole(projects, 'admin', {
            onCreate: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onOpen: vi.fn(),
        });

        const grid = document.getElementById('projectsGrid');
        expect(grid.querySelector('.edit-btn')).toBeTruthy();
        expect(grid.querySelector('.delete-btn')).toBeTruthy();
        expect(grid.querySelector('.project-card-new')).toBeTruthy();
    });

    it('showUserModal renders form with project checkboxes', async () => {
        const { showUserModal } = await import('../js/ui.js');
        const projects = [
            { id: 1, name: 'Project A' },
            { id: 2, name: 'Project B' },
        ];

        showUserModal(null, projects, vi.fn());

        expect(document.getElementById('userModalName')).toBeTruthy();
        expect(document.getElementById('userModalEmail')).toBeTruthy();
        expect(document.getElementById('userModalPassword')).toBeTruthy();
        expect(document.getElementById('userProject_1')).toBeTruthy();
        expect(document.getElementById('userProject_2')).toBeTruthy();

        // Clean up
        document.getElementById('userModal')?.remove();
    });

    it('showUserModal pre-checks projects for existing user', async () => {
        const { showUserModal } = await import('../js/ui.js');
        const user = { id: 2, name: 'User', email: 'u@t.com', project_ids: [1] };
        const projects = [
            { id: 1, name: 'Project A' },
            { id: 2, name: 'Project B' },
        ];

        showUserModal(user, projects, vi.fn());

        expect(document.getElementById('userProject_1').checked).toBe(true);
        expect(document.getElementById('userProject_2').checked).toBe(false);

        document.getElementById('userModal')?.remove();
    });

    it('showChangePasswordModal renders password fields', async () => {
        const { showChangePasswordModal } = await import('../js/ui.js');
        showChangePasswordModal(vi.fn());

        expect(document.getElementById('cpCurrentPassword')).toBeTruthy();
        expect(document.getElementById('cpNewPassword')).toBeTruthy();

        document.getElementById('changePasswordModal')?.remove();
    });
});

// --- Integration-like tests ---

describe('Auth flow integration', () => {
    it('login error shows validation on empty fields', async () => {
        document.body.innerHTML = '<div id="viewLogin"></div>';
        const { showLoginView } = await import('../js/ui.js');

        const onLogin = vi.fn();
        showLoginView(onLogin);

        // Click login without filling fields
        document.getElementById('btnLogin').click();
        await new Promise(r => setTimeout(r, 10));

        const errorEl = document.getElementById('loginError');
        expect(errorEl.classList.contains('visible')).toBe(true);
        expect(errorEl.textContent).toContain('email');
        expect(onLogin).not.toHaveBeenCalled();

        document.body.innerHTML = '';
    });

    it('setup error on short password', async () => {
        document.body.innerHTML = '<div id="viewSetup"></div>';
        const { showSetupView } = await import('../js/ui.js');

        const onSetup = vi.fn();
        showSetupView(onSetup);

        document.getElementById('setupEmail').value = 'test@test.com';
        document.getElementById('setupPassword').value = '123';
        document.getElementById('btnSetup').click();
        await new Promise(r => setTimeout(r, 10));

        const errorEl = document.getElementById('setupError');
        expect(errorEl.classList.contains('visible')).toBe(true);
        expect(errorEl.textContent).toContain('6');
        expect(onSetup).not.toHaveBeenCalled();

        document.body.innerHTML = '';
    });
});
