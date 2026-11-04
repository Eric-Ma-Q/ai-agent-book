// Settings page entry. Model profiles are the first global section; every AI
// surface (lab, page assistant, interview) reads the same catalog.
import { mountModelSettings } from './models-page';
import { mountUpdateSettings } from '../update/update-page';

const root = document.getElementById('settings-root');
if (root) mountModelSettings(root);

// Requirement 031: the update card lives below the model profiles; it is the
// only settings section allowed to call the update service.
const updateRoot = document.getElementById('update-root');
if (updateRoot) mountUpdateSettings(updateRoot);
