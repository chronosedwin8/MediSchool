import type { Route } from '../meds/five-rights';

export interface CatalogMedication {
  genericName: string;
  brandNames: string[];
  form: string;
  concentration: string;
  route: Route;
  atc: string;
  otcAllowed: boolean;
  controlled: boolean;
  requiresRefrigeration: boolean;
  rescue: boolean;
}

/** Base catalog for school nursing (Colombia). Admin can extend it. */
export const MEDICATION_CATALOG: CatalogMedication[] = [
  { genericName: 'Acetaminofén', brandNames: ['Dolex', 'Winadol'], form: 'Tableta', concentration: '500 mg', route: 'ORAL', atc: 'N02BE01', otcAllowed: true, controlled: false, requiresRefrigeration: false, rescue: false },
  { genericName: 'Acetaminofén', brandNames: ['Dolex Niños'], form: 'Jarabe', concentration: '150 mg/5 mL', route: 'ORAL', atc: 'N02BE01', otcAllowed: true, controlled: false, requiresRefrigeration: false, rescue: false },
  { genericName: 'Ibuprofeno', brandNames: ['Advil', 'Motrin'], form: 'Tableta', concentration: '400 mg', route: 'ORAL', atc: 'M01AE01', otcAllowed: true, controlled: false, requiresRefrigeration: false, rescue: false },
  { genericName: 'Ibuprofeno', brandNames: ['Advil Niños'], form: 'Suspensión', concentration: '100 mg/5 mL', route: 'ORAL', atc: 'M01AE01', otcAllowed: true, controlled: false, requiresRefrigeration: false, rescue: false },
  { genericName: 'Loratadina', brandNames: ['Clarityne'], form: 'Tableta', concentration: '10 mg', route: 'ORAL', atc: 'R06AX13', otcAllowed: true, controlled: false, requiresRefrigeration: false, rescue: false },
  { genericName: 'Loratadina', brandNames: ['Clarityne jarabe'], form: 'Jarabe', concentration: '5 mg/5 mL', route: 'ORAL', atc: 'R06AX13', otcAllowed: true, controlled: false, requiresRefrigeration: false, rescue: false },
  { genericName: 'Cetirizina', brandNames: ['Zyrtec'], form: 'Tableta', concentration: '10 mg', route: 'ORAL', atc: 'R06AE07', otcAllowed: true, controlled: false, requiresRefrigeration: false, rescue: false },
  { genericName: 'Salbutamol', brandNames: ['Ventolin'], form: 'Inhalador', concentration: '100 mcg/dosis', route: 'INHALED', atc: 'R03AC02', otcAllowed: false, controlled: false, requiresRefrigeration: false, rescue: true },
  { genericName: 'Beclometasona', brandNames: ['Beclazone'], form: 'Inhalador', concentration: '50 mcg/dosis', route: 'INHALED', atc: 'R03BA01', otcAllowed: false, controlled: false, requiresRefrigeration: false, rescue: false },
  { genericName: 'Epinefrina', brandNames: ['EpiPen Jr'], form: 'Autoinyector', concentration: '0,15 mg', route: 'INTRAMUSCULAR', atc: 'C01CA24', otcAllowed: false, controlled: false, requiresRefrigeration: false, rescue: true },
  { genericName: 'Epinefrina', brandNames: ['EpiPen'], form: 'Autoinyector', concentration: '0,3 mg', route: 'INTRAMUSCULAR', atc: 'C01CA24', otcAllowed: false, controlled: false, requiresRefrigeration: false, rescue: true },
  { genericName: 'Glucagón', brandNames: ['GlucaGen HypoKit'], form: 'Polvo para inyección', concentration: '1 mg', route: 'INTRAMUSCULAR', atc: 'H04AA01', otcAllowed: false, controlled: false, requiresRefrigeration: true, rescue: true },
  { genericName: 'Midazolam', brandNames: ['Buccolam'], form: 'Solución bucal', concentration: '5 mg/mL', route: 'BUCCAL', atc: 'N05CD08', otcAllowed: false, controlled: true, requiresRefrigeration: false, rescue: true },
  { genericName: 'Diazepam', brandNames: ['Stesolid'], form: 'Solución rectal', concentration: '5 mg', route: 'RECTAL', atc: 'N05BA01', otcAllowed: false, controlled: true, requiresRefrigeration: false, rescue: true },
  { genericName: 'Metilfenidato', brandNames: ['Ritalina', 'Concerta'], form: 'Tableta', concentration: '10 mg', route: 'ORAL', atc: 'N06BA04', otcAllowed: false, controlled: true, requiresRefrigeration: false, rescue: false },
  { genericName: 'Insulina lispro', brandNames: ['Humalog'], form: 'Solución inyectable', concentration: '100 UI/mL', route: 'SUBCUTANEOUS', atc: 'A10AB04', otcAllowed: false, controlled: false, requiresRefrigeration: true, rescue: false },
  { genericName: 'Insulina glargina', brandNames: ['Lantus'], form: 'Solución inyectable', concentration: '100 UI/mL', route: 'SUBCUTANEOUS', atc: 'A10AE04', otcAllowed: false, controlled: false, requiresRefrigeration: true, rescue: false },
  { genericName: 'Glucosa', brandNames: ['Gel de glucosa'], form: 'Gel oral', concentration: '15 g', route: 'ORAL', atc: 'V06DC01', otcAllowed: true, controlled: false, requiresRefrigeration: false, rescue: true },
  { genericName: 'Hidróxido de aluminio + hidróxido de magnesio', brandNames: ['Mylanta'], form: 'Suspensión', concentration: '400/400 mg/5 mL', route: 'ORAL', atc: 'A02AD01', otcAllowed: true, controlled: false, requiresRefrigeration: false, rescue: false },
  { genericName: 'Sales de rehidratación oral', brandNames: ['Pedialyte'], form: 'Solución', concentration: '45 mEq Na', route: 'ORAL', atc: 'A07CA', otcAllowed: true, controlled: false, requiresRefrigeration: false, rescue: false },
  { genericName: 'Butilbromuro de hioscina', brandNames: ['Buscapina'], form: 'Tableta', concentration: '10 mg', route: 'ORAL', atc: 'A03BB01', otcAllowed: true, controlled: false, requiresRefrigeration: false, rescue: false },
  { genericName: 'Ondansetrón', brandNames: ['Zofran'], form: 'Tableta dispersable', concentration: '4 mg', route: 'ORAL', atc: 'A04AA01', otcAllowed: false, controlled: false, requiresRefrigeration: false, rescue: false },
  { genericName: 'Hidrocortisona', brandNames: ['Hidrocortisona crema'], form: 'Crema', concentration: '1 %', route: 'TOPICAL', atc: 'D07AA02', otcAllowed: true, controlled: false, requiresRefrigeration: false, rescue: false },
  { genericName: 'Clorhexidina', brandNames: ['Clorhexidina solución'], form: 'Solución', concentration: '0,5 %', route: 'TOPICAL', atc: 'D08AC02', otcAllowed: true, controlled: false, requiresRefrigeration: false, rescue: false },
  { genericName: 'Sulfadiazina de plata', brandNames: ['Platsul'], form: 'Crema', concentration: '1 %', route: 'TOPICAL', atc: 'D06BA01', otcAllowed: false, controlled: false, requiresRefrigeration: false, rescue: false },
  { genericName: 'Omeprazol', brandNames: ['Losec'], form: 'Cápsula', concentration: '20 mg', route: 'ORAL', atc: 'A02BC01', otcAllowed: false, controlled: false, requiresRefrigeration: false, rescue: false },
  { genericName: 'Amoxicilina', brandNames: ['Amoxal'], form: 'Suspensión', concentration: '250 mg/5 mL', route: 'ORAL', atc: 'J01CA04', otcAllowed: false, controlled: false, requiresRefrigeration: true, rescue: false },
  { genericName: 'Lágrimas artificiales', brandNames: ['Systane'], form: 'Gotas oftálmicas', concentration: '0,4 %', route: 'OPHTHALMIC', atc: 'S01XA20', otcAllowed: true, controlled: false, requiresRefrigeration: false, rescue: false },
];

export const SUPPLY_CATALOG: { name: string; unit: string; minStock: number }[] = [
  { name: 'Gasa estéril 7,5 × 7,5 cm', unit: 'unidad', minStock: 100 },
  { name: 'Curitas (apósito adhesivo)', unit: 'unidad', minStock: 200 },
  { name: 'Esparadrapo micropore', unit: 'rollo', minStock: 10 },
  { name: 'Guantes de nitrilo talla M', unit: 'par', minStock: 100 },
  { name: 'Compresa fría instantánea', unit: 'unidad', minStock: 30 },
  { name: 'Venda elástica 3"', unit: 'unidad', minStock: 15 },
  { name: 'Solución salina 0,9 % 500 mL', unit: 'frasco', minStock: 10 },
  { name: 'Alcohol antiséptico 70 %', unit: 'frasco', minStock: 5 },
  { name: 'Lancetas', unit: 'unidad', minStock: 100 },
  { name: 'Tiras para glucómetro', unit: 'unidad', minStock: 50 },
  { name: 'Bajalenguas', unit: 'unidad', minStock: 100 },
  { name: 'Mascarilla quirúrgica', unit: 'unidad', minStock: 100 },
  { name: 'Toalla higiénica', unit: 'unidad', minStock: 50 },
];
