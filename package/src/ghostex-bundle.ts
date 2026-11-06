// =============================================================================
// Ghostex bundle entry
// =============================================================================
//
// Ghostex (https://github.com/maddada/ghostex) puts Agentation into pages it
// shows (its Browser, Storybook and HTML files) without network access to a
// CDN, so it ships one self-contained script built from this entry by
// `pnpm build:ghostex`: React, ReactDOM and Agentation together, exposed as
// the `__ghostexAgentation` value the script defines.
//

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Agentation } from "./index";

export { createElement, createRoot, Agentation };
export const version = __VERSION__;
