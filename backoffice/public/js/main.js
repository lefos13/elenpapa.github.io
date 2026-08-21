/**
 * Why this exists:
 * The browser entrypoint remains tiny so startup order is explicit and all app
 * logic stays in reusable modules.
 */
import { createBackofficeApp } from './app.js'
import { getElements } from './dom.js'

const app = createBackofficeApp(getElements())
app.init()
