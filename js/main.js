/**
 * Application entry point.
 * Loads settings, initializes router, boots views.
 */

import { EventBus } from './event-bus.js';
import { Config } from './config.js';
import { YonoteClient } from './yonote-client.js';
import { ToolExecutor } from './tool-executor.js';
import { ProjectApi } from './project-api.js';
import { Router } from './router.js';
import {
    initReportView,
    showSettingsModal,
    renderProjectsView,
    showProjectModal,
    showDeleteConfirm,
} from './ui.js';

let _config = null;
let _yonote = null;
let _eventBus = null;
let _projectApi = null;
let _router = null;

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

function updateHeader(isProjectView) {
    const btnBack = document.getElementById('btnBack');
    const headerBrand = document.getElementById('headerBrand');
    if (btnBack) btnBack.style.display = isProjectView ? '' : 'none';
    if (headerBrand) headerBrand.style.display = isProjectView ? 'none' : '';
}

async function loadProjectsView() {
    _config.clearProject();
    showView('viewProjects');
    updateHeader(false);

    try {
        const projects = await _projectApi.list();
        renderProjectsView(projects, {
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

    try {
        const project = await _projectApi.get(projectId);
        _config.setProject(project);

        const executor = new ToolExecutor(_yonote, null, _eventBus, _config);
        initReportView(executor, _eventBus, _config, _yonote, projectId);
    } catch (e) {
        console.error('Failed to load project:', e);
        _router.navigate('#/projects');
    }
}

async function boot() {
    _config = new Config();
    await _config.load();

    if (!_config.get('yonote_api_token')) {
        showSettingsModal(_config, boot);
        return;
    }

    _eventBus = new EventBus();
    _projectApi = new ProjectApi();
    _yonote = new YonoteClient(
        _config.get('yonote_api_token'),
        _config.get('yonote_base_url') || 'https://app.yonote.ru/api'
    );

    // Pre-fetch workspace URL for fullUrl() calls
    try {
        await _yonote.getWorkspaceUrl();
    } catch (e) {
        console.warn('Failed to fetch workspace URL:', e);
    }

    // Settings button
    const btnSettings = document.getElementById('btnSettings');
    if (btnSettings) {
        // Clone to remove old listeners
        const newBtn = btnSettings.cloneNode(true);
        btnSettings.parentNode.replaceChild(newBtn, btnSettings);
        newBtn.addEventListener('click', () => {
            showSettingsModal(_config, () => window.location.reload());
        });
    }

    // Back button
    const btnBack = document.getElementById('btnBack');
    if (btnBack) {
        btnBack.addEventListener('click', () => {
            _router.navigate('#/projects');
        });
    }

    // Setup router
    _router = new Router();
    _router.add('#/projects', () => loadProjectsView());
    _router.add('#/project/:id', (params) => loadProjectView(params));
    _router.start();
}

document.addEventListener('DOMContentLoaded', boot);
