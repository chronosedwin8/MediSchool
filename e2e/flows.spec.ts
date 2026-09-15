import { expect, test } from '@playwright/test';
import { apiCall, fieldByLabel, login } from './helpers';

const DEMO = 'colegio-demo.test';

test.describe.serial('Aula → enfermería → retorno al aula', () => {
  test('docente envía un pase y enfermería atiende y cierra @mobile', async ({ browser }) => {
    const teacher = await login(browser, `docente@${DEMO}`, { viewport: { width: 412, height: 915 } });
    await expect(teacher).toHaveURL(/\/docente/);
    await expect(teacher.getByRole('heading', { name: 'Mi clase' })).toBeVisible();

    // first student without an open pass
    const card = teacher.locator('ul li button:not([disabled])').first();
    const studentName = (await card.locator('span.line-clamp-2').innerText()).trim();
    await card.click();
    await teacher.getByRole('button', { name: 'Dolor de cabeza' }).click();
    await teacher.getByRole('button', { name: 'Enviar a enfermería' }).click();
    await expect(teacher.getByText('va en camino a enfermería')).toBeVisible();
    await expect(teacher.getByText(studentName).first()).toBeVisible();

    const nurse = await login(browser, `enfermera1@${DEMO}`);
    await expect(nurse).toHaveURL(/\/enfermeria/);
    const passCard = nurse.locator('article', { hasText: studentName }).first();
    await expect(passCard).toBeVisible();
    await passCard.getByRole('button', { name: 'Atender' }).click();
    await nurse.waitForURL(/\/enfermeria\/atenciones\//);

    await expect(nurse.getByText('Motivo y tipo')).toBeVisible();
    await nurse.getByLabel('Temperatura (°C)').fill('36.8');
    await nurse.getByLabel('Frecuencia cardiaca (lpm)').fill('88');
    await nurse.getByRole('button', { name: 'Registrar toma' }).click();
    await expect(nurse.getByText('Signos vitales registrados')).toBeVisible();

    await fieldByLabel(nurse, 'A — Valoración / impresión').fill('Cefalea tensional leve');
    await nurse.getByRole('button', { name: /\+ R51/ }).click();
    await nurse.getByRole('button', { name: 'Guardar' }).first().click();
    await expect(nurse.getByText(/Guardado \d/)).toBeVisible();
    await nurse.getByRole('button', { name: 'Cerrar y firmar' }).click();
    const dialog = nurse.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Retorno al aula' }).click();
    await dialog.getByRole('button', { name: 'Firmar y cerrar' }).click();
    await expect(nurse.getByText('Atención cerrada y firmada')).toBeVisible();
    await expect(nurse.getByText(/Firmada por/)).toBeVisible();

    await teacher.reload();
    await expect(teacher.locator('li', { hasText: studentName }).getByText('Retorno al aula').first()).toBeVisible();
    await teacher.context().close();
    await nurse.context().close();
  });
});

test.describe.serial('Salida con acudiente y portería', () => {
  test('enfermería autoriza, el acudiente confirma y portería entrega', async ({ browser }) => {
    const parent = await login(browser, `padre@${DEMO}`, { viewport: { width: 412, height: 915 } });
    const me = await apiCall<{ children: { id: string; name: string }[] }>(parent, 'GET', '/auth/me');
    const child = me.children[0];

    const nurse = await login(browser, `enfermera1@${DEMO}`);
    // Close any previous open encounter/pass for a clean run.
    const open = await apiCall<{ items: { id: string; status: string }[] }>(nurse, 'GET', `/encounters?studentId=${child.id}&status=OPEN`);
    for (const e of open.items) {
      await apiCall(nurse, 'POST', `/encounters/${e.id}/close`, { disposition: 'RETURN_TO_CLASS', notifyGuardians: false }, true).catch(() => undefined);
    }
    // Walk leftover passes from earlier runs to a terminal state through legal transitions.
    const cleanup: Record<string, string[]> = {
      REQUESTED: ['CANCELLED'],
      IN_TRANSIT: ['CANCELLED'],
      RECEIVED: ['CANCELLED'],
      IN_CARE: ['RETURNED_TO_CLASS', 'CLOSED'],
      OBSERVATION: ['RETURNED_TO_CLASS', 'CLOSED'],
      RETURNED_TO_CLASS: ['CLOSED'],
      WAITING_GUARDIAN: ['TRANSFERRED_IPS', 'CLOSED'],
      EXIT_AUTHORIZED: ['WAITING_GUARDIAN', 'TRANSFERRED_IPS', 'CLOSED'],
      HANDED_OVER: ['CLOSED'],
      TRANSFERRED_IPS: ['CLOSED'],
    };
    const leftovers = await apiCall<{ id: string; state: string }[]>(nurse, 'GET', `/passes?studentId=${child.id}&open=true`);
    for (const p of leftovers) {
      for (const to of cleanup[p.state] ?? []) {
        await apiCall(nurse, 'POST', `/passes/${p.id}/transition`, { to, note: 'Limpieza de prueba E2E' });
      }
    }
    const pass = await apiCall<{ id: string }>(nurse, 'POST', '/passes', { studentId: child.id, reason: 'Fiebre', urgency: 'HIGH' }, true);
    const enc = await apiCall<{ id: string }>(nurse, 'POST', '/encounters', { subjectType: 'STUDENT', studentId: child.id, passId: pass.id, type: 'ILLNESS', chiefComplaint: 'Fiebre' }, true);

    await nurse.goto(`/enfermeria/atenciones/${enc.id}`);
    await fieldByLabel(nurse, 'A — Valoración / impresión').fill('Síndrome febril');
    await nurse.getByRole('button', { name: 'Cerrar y firmar' }).click();
    const close = nurse.getByRole('dialog');
    await close.getByRole('button', { name: 'Retiro por acudiente' }).click();
    await close.getByRole('button', { name: 'Firmar y cerrar' }).click();
    const exitDialog = nurse.getByRole('dialog', { name: 'Autorización de salida' });
    await expect(exitDialog).toBeVisible();
    await exitDialog.getByRole('button', { name: 'Notificar a los acudientes' }).click();
    await expect(nurse.getByText('Notificación enviada')).toBeVisible();

    await parent.goto('/familia');
    await expect(parent.getByText('Enfermería solicita que recojan a su hijo(a)')).toBeVisible();
    await parent.getByRole('link', { name: 'Confirmar quién recoge' }).click();
    await parent.getByRole('button', { name: /Otra persona/ }).click();
    await fieldByLabel(parent, 'Nombre completo').fill('Carmen Tía Prueba');
    await fieldByLabel(parent, 'Documento').fill('52123456');
    await fieldByLabel(parent, 'Relación con el estudiante').fill('Tía');
    await parent.getByRole('button', { name: 'Confirmar' }).click();
    await expect(parent.getByText('Confirmado')).toBeVisible();

    const gate = await login(browser, `porteria@${DEMO}`);
    await expect(gate).toHaveURL(/\/porteria/);
    const ready = gate.locator('div', { hasText: 'Carmen Tía Prueba' }).getByRole('button', { name: 'Entregar' }).first();
    await expect(ready).toBeVisible();
    await ready.click();
    const checkout = gate.getByRole('dialog', { name: 'Registrar entrega' });
    await checkout.getByLabel('Número de documento presentado').fill('11111');
    await expect(checkout.getByText('No coincide con el documento autorizado')).toBeVisible();
    await checkout.getByLabel('Número de documento presentado').fill('52123456');
    await checkout.getByRole('button', { name: 'Confirmar entrega' }).click();
    await expect(gate.getByText(/Salida registrada/)).toBeVisible();

    const detail = await apiCall<{ state: string; events: { toState: string }[] }>(nurse, 'GET', `/passes/${pass.id}`);
    expect(detail.state).toBe('CLOSED');
    expect(detail.events.map((e) => e.toState)).toEqual(['REQUESTED', 'IN_TRANSIT', 'RECEIVED', 'IN_CARE', 'WAITING_GUARDIAN', 'EXIT_AUTHORIZED', 'HANDED_OVER', 'CLOSED']);
    for (const p of [parent, nurse, gate]) await p.context().close();
  });
});

test.describe('Emergencia y estadísticas', () => {
  test('modo emergencia muestra la ficha crítica en un clic', async ({ browser }) => {
    const nurse = await login(browser, `enfermera1@${DEMO}`);
    const withAlert = await apiCall<{ items: { id: string; name: string }[] }>(nurse, 'GET', '/students?withAlerts=true&limit=1');
    await nurse.getByRole('button', { name: /EMERGENCIA/ }).click();
    const dialog = nurse.getByRole('dialog');
    await dialog.getByLabel('Buscar estudiante').fill(withAlert.items[0].name.split(' ')[0]);
    await dialog.getByRole('option').filter({ hasText: withAlert.items[0].name }).first().click();
    await expect(dialog.getByRole('button', { name: 'Llamar al 123' })).toBeVisible();
    await expect(dialog.getByText('Contactos')).toBeVisible();
    await expect(dialog.getByText(/Protocolo:/).first()).toBeVisible();
    await nurse.context().close();
  });

  test('directivo ve el tablero anónimo con gráficas', async ({ browser }) => {
    const director = await login(browser, `directivo@${DEMO}`);
    await expect(director).toHaveURL(/\/estadisticas/);
    await expect(director.getByRole('heading', { name: 'Estadísticas' })).toBeVisible();
    await expect(director.getByText('Atenciones por día')).toBeVisible();
    await expect(director.getByText('Datos agregados y anónimos según su perfil.')).toBeVisible();
    await director.getByRole('button', { name: '90 días' }).click();
    await expect(director.getByText('Motivos más frecuentes')).toBeVisible();
    await director.context().close();
  });
});
