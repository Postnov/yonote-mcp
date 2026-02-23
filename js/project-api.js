/**
 * Project API client — CRUD operations for projects stored in SQLite.
 */
export class ProjectApi {
    async list() {
        const resp = await fetch('api/projects.php');
        if (!resp.ok) throw new Error('Failed to load projects');
        return resp.json();
    }

    async get(id) {
        const resp = await fetch(`api/projects.php?id=${encodeURIComponent(id)}`);
        if (!resp.ok) throw new Error('Project not found');
        return resp.json();
    }

    async create(name, data = {}) {
        const resp = await fetch('api/projects.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, data }),
        });
        if (!resp.ok) throw new Error('Failed to create project');
        return resp.json();
    }

    async update(id, fields) {
        const resp = await fetch(`api/projects.php?id=${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fields),
        });
        if (!resp.ok) throw new Error('Failed to update project');
        return resp.json();
    }

    async delete(id) {
        const resp = await fetch(`api/projects.php?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
        });
        if (!resp.ok) throw new Error('Failed to delete project');
        return resp.json();
    }
}
