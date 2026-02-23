/**
 * User API client — CRUD for user management (admin only).
 */
export class UserApi {
    async list() {
        const resp = await fetch('/api/users.php', { credentials: 'same-origin' });
        if (!resp.ok) throw new Error((await resp.json()).error || 'Failed to list users');
        return resp.json();
    }

    async get(id) {
        const resp = await fetch(`/api/users.php?id=${id}`, { credentials: 'same-origin' });
        if (!resp.ok) throw new Error((await resp.json()).error || 'Failed to get user');
        return resp.json();
    }

    async create({ email, name, password, project_ids }) {
        const resp = await fetch('/api/users.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ email, name, password, project_ids }),
        });
        if (!resp.ok) throw new Error((await resp.json()).error || 'Failed to create user');
        return resp.json();
    }

    async update(id, data) {
        const resp = await fetch(`/api/users.php?id=${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(data),
        });
        if (!resp.ok) throw new Error((await resp.json()).error || 'Failed to update user');
        return resp.json();
    }

    async delete(id) {
        const resp = await fetch(`/api/users.php?id=${id}`, {
            method: 'DELETE',
            credentials: 'same-origin',
        });
        if (!resp.ok) throw new Error((await resp.json()).error || 'Failed to delete user');
        return resp.json();
    }
}
