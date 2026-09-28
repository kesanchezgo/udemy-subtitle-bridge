// Register hook: resuelve imports SIN extensión dentro de los .ts de src/
// para que los scripts de QA en Node ejerzan el código de producción real.
import { register } from 'node:module';

register('./ts-resolve-loader.mjs', import.meta.url);
