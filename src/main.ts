import { mount } from 'svelte';
import App from './App.svelte';
import './styles.css';
import './modules.css';
import './workspaces.css';
import './data-health.css';
import './atlas-drag.css';
import './market-board.css';
import './dashboard-dense.css';

mount(App, { target: document.getElementById('app')! });
