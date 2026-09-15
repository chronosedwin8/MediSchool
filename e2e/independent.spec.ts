import { expect, test } from '@playwright/test';
import { apiCall, fieldByLabel, login } from './helpers';

// 1×1 PNG used as a student photo.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

test.describe('Modalidad independiente (colegio demo)', () => {
  test('administración crea un estudiante, sube su foto y el docente la ve en Mi clase', async ({ browser }) => {
    const adminPage = await login(browser, 'admin@colegio-demo.test');
    const me = await apiCall<{ settings: { dataSource: string } }>(adminPage, 'GET', '/auth/me');
    expect(me.settings.dataSource).toBe('LOCAL');

    const teacher = await login(browser, 'docente@colegio-demo.test');
    const cls = await apiCall<{ id: string; name: string }[]>(teacher, 'GET', '/teacher/class');
    const group = cls[0];
    const code = `E2E${Date.now().toString().slice(-7)}`;

    await adminPage.goto('/estudiantes');
    await adminPage.getByRole('button', { name: 'Nuevo estudiante' }).click();
    const dialog = adminPage.getByRole('dialog', { name: 'Nuevo estudiante' });
    await fieldByLabel(adminPage, 'Código del estudiante').fill(code);
    await fieldByLabel(adminPage, 'Nombres').fill('Prueba');
    await fieldByLabel(adminPage, 'Apellidos').fill('Independiente');
    const groupSelect = fieldByLabel(adminPage, 'Grupo');
    const value = await groupSelect.locator('option').filter({ hasText: new RegExp(`· ${group.name}$`) }).first().getAttribute('value');
    await groupSelect.selectOption(value!);
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await adminPage.waitForURL(/\/estudiantes\/[0-9a-f-]{36}$/);
    const studentId = adminPage.url().split('/').pop()!;
    await expect(adminPage.getByText('Prueba Independiente').first()).toBeVisible();

    await adminPage.getByRole('button', { name: 'Foto', exact: true }).click();
    const photo = adminPage.getByRole('dialog', { name: 'Foto del estudiante' });
    await photo.locator('input[type="file"]:not([capture])').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await photo.getByRole('button', { name: 'Guardar foto' }).click();
    await expect(adminPage.getByText('Foto actualizada. Se verá en todos los paneles.')).toBeVisible();

    await teacher.goto('/docente');
    await teacher.getByRole('tab', { name: new RegExp(group.name) }).first().click();
    await expect(teacher.getByRole('img', { name: 'Foto de Prueba Independiente' })).toBeVisible();

    // Retire the test student so the demo class stays clean.
    const res = await adminPage.request.fetch(`/api/v1/students/${studentId}`, { method: 'PATCH', data: { status: 'INACTIVE' }, headers: { 'X-Requested-With': 'sgee' } });
    expect(res.ok()).toBeTruthy();
    await adminPage.context().close();
    await teacher.context().close();
  });

  test('el panel de Phidias indica la modalidad independiente y la estructura es editable', async ({ browser }) => {
    const page = await login(browser, 'admin@colegio-demo.test');
    await page.goto('/admin');
    await page.getByRole('tab', { name: 'Phidias' }).click();
    await expect(page.getByText('El colegio trabaja de forma independiente de Phidias')).toBeVisible();
    await page.getByRole('tab', { name: 'Estructura académica' }).click();
    await expect(page.getByRole('button', { name: 'Nueva sección' })).toBeVisible();
    await page.context().close();
  });
});
