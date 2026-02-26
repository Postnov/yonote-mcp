/**
 * Application entry point.
 * Auth-first boot: check session → setup/login → load app.
 */

import { EventBus } from './event-bus.js';
import { Config } from './config.js';
import { YonoteClient } from './yonote-client.js';
import { ToolExecutor } from './tool-executor.js';
import { ProjectApi } from './project-api.js';
import { Router } from './router.js';
import { AuthClient } from './auth.js';
import { UserApi } from './user-api.js';
import {
    initReportView,
    showSettingsModal,
    renderProjectsViewWithRole,
    renderSettingsView,
    showProjectModal,
    showDeleteConfirm,
    showLoginView,
    showSetupView,
    renderAdminView,
    showUserModal,
    showChangePasswordModal,
    escapeHtml,
} from './ui.js';

let _config = null;
let _yonote = null;
let _eventBus = null;
let _projectApi = null;
let _userApi = null;
let _authClient = null;
let _router = null;
let _currentUser = null;

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => {
        v.style.display = 'none';
        v.classList.remove('active');
    });
    const el = document.getElementById(viewId);
    if (el) {
        el.style.display = 'block';
        el.classList.add('active');
    }
}

function showHeader(visible) {
    const header = document.getElementById('appHeader');
    if (header) header.style.display = visible ? '' : 'none';
}

function updateHeader(isProjectView) {
    const btnBack = document.getElementById('btnBack');
    const btnBackMobile = document.getElementById('btnBackMobile');
    if (btnBack) btnBack.style.display = isProjectView ? '' : 'none';
    if (btnBackMobile) btnBackMobile.style.display = isProjectView ? '' : 'none';
}

function updateHeaderForUser(user) {
    const btnNavUsers = document.getElementById('btnNavUsers');
    const btnNavSettings = document.getElementById('btnNavSettings');
    const btnLogout = document.getElementById('btnLogout');
    const isAdmin = user.role === 'admin';

    if (btnNavUsers) btnNavUsers.style.display = isAdmin ? '' : 'none';
    if (btnNavSettings) btnNavSettings.style.display = isAdmin ? '' : 'none';
    if (btnLogout) btnLogout.style.display = '';

    // Sync mobile drawer buttons
    const btnDrawerUsers = document.getElementById('btnDrawerUsers');
    const btnDrawerSettings = document.getElementById('btnDrawerSettings');
    const btnDrawerLogout = document.getElementById('btnDrawerLogout');

    if (btnDrawerUsers) btnDrawerUsers.style.display = isAdmin ? '' : 'none';
    if (btnDrawerSettings) btnDrawerSettings.style.display = isAdmin ? '' : 'none';
    if (btnDrawerLogout) btnDrawerLogout.style.display = '';
}

function setActiveNav(btnId) {
    // Update header nav
    document.querySelectorAll('.header-nav-btn').forEach(b => b.classList.remove('is-active'));
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.add('is-active');

    // Update mobile drawer nav
    document.querySelectorAll('.mobile-drawer-btn').forEach(b => b.classList.remove('is-active'));
    const drawerBtnId = btnId.replace('btnNav', 'btnDrawer');
    const drawerBtn = document.getElementById(drawerBtnId);
    if (drawerBtn) drawerBtn.classList.add('is-active');
}

async function loadProjectsView() {
    _config.clearProject();
    showView('viewProjects');
    updateHeader(false);
    setActiveNav('btnNavProjects');

    try {
        const projects = await _projectApi.list();
        const role = _currentUser?.role || 'user';

        renderProjectsViewWithRole(projects, role, {
            onCreate: () => {
                showProjectModal(null, async (name, data) => {
                    await _projectApi.create(name, data);
                    await loadProjectsView();
                });
            },
            onEdit: (project) => {
                showProjectModal(project, async (name, data) => {
                    await _projectApi.update(project.id, { name, data });
                    await loadProjectsView();
                });
            },
            onDelete: (project) => {
                showDeleteConfirm(project.name, async () => {
                    await _projectApi.delete(project.id);
                    await loadProjectsView();
                });
            },
            onOpen: (project) => {
                _router.navigate(`#/project/${project.id}`);
            },
        });
    } catch (e) {
        console.error('Failed to load projects:', e);
    }
}

async function loadProjectView(params) {
    const projectId = params.id;
    showView('viewReport');
    updateHeader(true);
    setActiveNav('btnNavProjects');

    try {
        const project = await _projectApi.get(projectId);
        _config.setProject(project);

        const executor = new ToolExecutor(_yonote, null, _eventBus, _config);
        initReportView(executor, _eventBus, _config, _yonote, projectId, project, {
            onEditProject: () => {
                showProjectModal(project, async (name, data) => {
                    await _projectApi.update(project.id, { name, data });
                    await loadProjectView(params);
                });
            },
            onDeleteProject: () => {
                showDeleteConfirm(project.name, async () => {
                    await _projectApi.delete(project.id);
                    _router.navigate('#/projects');
                });
            },
        });
    } catch (e) {
        console.error('Failed to load project:', e);
        _router.navigate('#/projects');
    }
}

async function loadAdminView() {
    if (!_currentUser || _currentUser.role !== 'admin') {
        _router.navigate('#/projects');
        return;
    }

    showView('viewAdmin');
    updateHeader(false);
    setActiveNav('btnNavUsers');

    try {
        const [users, projects] = await Promise.all([
            _userApi.list(),
            _projectApi.list(),
        ]);

        renderAdminView(users, projects, {
            onAdd: () => {
                showUserModal(null, projects, async (data) => {
                    await _userApi.create(data);
                    await loadAdminView();
                });
            },
            onEdit: (user) => {
                showUserModal(
                    user,
                    projects,
                    async (data) => {
                        await _userApi.update(user.id, data);
                        await loadAdminView();
                    },
                    () => showDeleteConfirm(user.name || user.email, async () => {
                        await _userApi.delete(user.id);
                        await loadAdminView();
                    }, 'пользователя')
                );
            },
            onDelete: () => {},
        });
    } catch (e) {
        console.error('Failed to load admin view:', e);
    }
}

async function loadSettingsView() {
    if (!_currentUser || _currentUser.role !== 'admin') {
        _router.navigate('#/projects');
        return;
    }

    showView('viewSettings');
    updateHeader(false);
    setActiveNav('btnNavSettings');

    renderSettingsView(_config, () => window.location.reload());
}

async function initApp() {
    _config = new Config();
    _eventBus = new EventBus();
    _projectApi = new ProjectApi();
    _userApi = new UserApi();

    await _config.load();

    if (!_config.get('yonote_api_token')) {
        showSettingsModal(_config, () => window.location.reload());
        return;
    }

    _yonote = new YonoteClient(
        _config.get('yonote_api_token'),
        _config.get('yonote_base_url') || 'https://app.yonote.ru/api'
    );

    try {
        await _yonote.getWorkspaceUrl();
    } catch (e) {
        console.warn('Failed to fetch workspace URL:', e);
    }

    // Show header
    showHeader(true);
    updateHeaderForUser(_currentUser);

    // Logo click → projects
    const headerBrand = document.querySelector('.header-brand');
    if (headerBrand) {
        headerBrand.style.cursor = 'pointer';
        headerBrand.addEventListener('click', () => _router.navigate('#/projects'));
    }

    // Nav: Projects
    const btnNavProjects = document.getElementById('btnNavProjects');
    if (btnNavProjects) {
        btnNavProjects.addEventListener('click', () => _router.navigate('#/projects'));
    }

    // Nav: Users (admin only)
    const btnNavUsers = document.getElementById('btnNavUsers');
    if (btnNavUsers) {
        btnNavUsers.addEventListener('click', () => _router.navigate('#/admin'));
    }

    // Nav: Settings (admin only)
    const btnNavSettings = document.getElementById('btnNavSettings');
    if (btnNavSettings) {
        btnNavSettings.addEventListener('click', () => _router.navigate('#/settings'));
    }

    // Back button
    const btnBack = document.getElementById('btnBack');
    if (btnBack) {
        btnBack.addEventListener('click', () => _router.navigate('#/projects'));
    }

    // Logout button
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            await _authClient.logout();
            _currentUser = null;
            window.location.reload();
        });
    }

    // Setup router
    _router = new Router();
    _router.add('#/projects', () => loadProjectsView());
    _router.add('#/project/:id', (params) => loadProjectView(params));
    _router.add('#/admin', () => loadAdminView());
    _router.add('#/settings', () => loadSettingsView());
    _router.start();
}

async function boot() {
    _authClient = new AuthClient();

    // Check current session
    const result = await _authClient.check();

    if (result.error) {
        showHeader(false);

        // No users in DB → show setup
        if (result.needs_setup) {
            showView('viewSetup');
            showSetupView(async (email, password, name) => {
                await _authClient.setup(email, password, name);
                window.location.reload();
            });
            return;
        }

        // Has users but no valid session → show login
        showView('viewLogin');
        showLoginView(async (email, password) => {
            await _authClient.login(email, password);
            window.location.reload();
        });
        return;
    }

    // Authenticated — store user and init app
    _currentUser = result.user;
    await initApp();
}

document.addEventListener('DOMContentLoaded', boot);
