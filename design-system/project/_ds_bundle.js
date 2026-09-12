/* @ds-bundle: {"format":4,"namespace":"FoliantDesignSystem_b90fff","components":[{"name":"AppWindow","sourcePath":"components/chrome/AppWindow.jsx"},{"name":"FileSummary","sourcePath":"components/chrome/FileSummary.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"Callout","sourcePath":"components/feedback/Callout.jsx"},{"name":"LocalBadge","sourcePath":"components/feedback/LocalBadge.jsx"},{"name":"ProgressPhase","sourcePath":"components/feedback/ProgressPhase.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Disclosure","sourcePath":"components/forms/Disclosure.jsx"},{"name":"DropZone","sourcePath":"components/forms/DropZone.jsx"},{"name":"SegmentedControl","sourcePath":"components/forms/SegmentedControl.jsx"},{"name":"TextField","sourcePath":"components/forms/TextField.jsx"}],"sourceHashes":{"assets/icons/icon-data.js":"653c7a5d53bc","components/chrome/AppWindow.jsx":"ef00895d238a","components/chrome/FileSummary.jsx":"a4b7969667a2","components/core/Button.jsx":"d870d62717c6","components/core/Card.jsx":"77b54748e07e","components/core/Icon.jsx":"45d807d2d32b","components/core/Tag.jsx":"2ffb10fd60e7","components/feedback/Callout.jsx":"b3b30d8cd3d5","components/feedback/LocalBadge.jsx":"5092c97c8161","components/feedback/ProgressPhase.jsx":"5ed9b92964cb","components/forms/Checkbox.jsx":"3510f5f711db","components/forms/Disclosure.jsx":"c1fac6c435c7","components/forms/DropZone.jsx":"f89f4c3b5bfc","components/forms/SegmentedControl.jsx":"8f5d2df1e550","components/forms/TextField.jsx":"2a6cf6753553","ui_kits/foliant-app/ScreensConvert.jsx":"632d6b2895ab","ui_kits/foliant-app/ScreensResult.jsx":"7079569d7f59","ui_kits/foliant-app/ScreensStart.jsx":"258c7e5484cc"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.FoliantDesignSystem_b90fff = window.FoliantDesignSystem_b90fff || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// assets/icons/icon-data.js
try { (() => {
/* Subset self-hosted do Lucide (licença ISC), traço 2px, viewBox 24.
   Fonte: github.com/lucide-icons/lucide/icons/<nome>.svg — copiado verbatim.
   Os .svg individuais estão em assets/icons/. */
const ICONS = {
  "file-text": "<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 9H8\"/><path d=\"M16 13H8\"/><path d=\"M16 17H8\"/>",
  "shield-check": "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/><path d=\"m9 12 2 2 4-4\"/>",
  "circle-check": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m16 9-5.5 5.5L8 12\"/>",
  "circle-alert": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\"/><line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\"/>",
  "info": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4\"/><path d=\"M12 8h.01\"/>",
  "folder-open": "<path d=\"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2\"/>",
  "download": "<path d=\"M12 15V3\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/>",
  "book-open": "<path d=\"M12 5v16\"/><path d=\"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z\"/>",
  "chevron-down": "<path d=\"m6 9 6 6 6-6\"/>",
  "check": "<path d=\"M20 6 9 17l-5-5\"/>",
  "x": "<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>",
  "tablet": "<rect width=\"16\" height=\"20\" x=\"4\" y=\"2\" rx=\"2\" ry=\"2\"/><line x1=\"12\" x2=\"12.01\" y1=\"18\" y2=\"18\"/>",
  "clock": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 6v6l4 2\"/>",
  "hard-drive": "<path d=\"M10 16h.01\"/><path d=\"M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z\"/><path d=\"M21.946 12.013H2.054\"/><path d=\"M6 16h.01\"/>"
};
const ALIASES = {
  "check-circle": "circle-check",
  "alert-circle": "circle-alert"
};
if (typeof window !== "undefined") {
  window.FoliantIcons = {
    ICONS,
    ALIASES
  };
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "assets/icons/icon-data.js", error: String((e && e.message) || e) }); }

// components/chrome/AppWindow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Moldura de janela do app desktop: barra de título discreta + área de conteúdo
   com largura máxima de 560px (a mesma do app real). */
function AppWindow({
  title = "Foliant",
  badge,
  children,
  width = 640,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      width,
      maxWidth: "100%",
      background: "var(--surface-app)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-modal)",
      overflow: "hidden",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)",
      padding: "var(--space-2) var(--space-3)",
      background: "var(--beige)",
      borderBottom: "1px solid var(--border-default)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      gap: 6
    }
  }, ["#D6CCBD", "#D6CCBD", "#D6CCBD"].map((c, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      width: 11,
      height: 11,
      borderRadius: "var(--radius-pill)",
      background: c,
      border: "1px solid var(--gray-300)"
    }
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      font: "500 var(--text-caption)/1 var(--font-sans)",
      color: "var(--gray-500)"
    }
  }, title), badge), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-6)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-4)"
    }
  }, children));
}
Object.assign(__ds_scope, { AppWindow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chrome/AppWindow.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const surfaces = {
  card: {
    background: "var(--surface-card)",
    borderColor: "var(--gray-300)"
  },
  sunken: {
    background: "var(--surface-sunken)",
    borderColor: "var(--gray-300)"
  },
  plain: {
    background: "var(--white)",
    borderColor: "var(--gray-300)"
  },
  brandTint: {
    background: "var(--surface-brand-tint)",
    borderColor: "var(--blue-600)"
  }
};
function Card({
  children,
  surface = "card",
  padding = "var(--space-4)",
  radius = "var(--radius-md)",
  bordered = true,
  elevated = false,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      ...surfaces[surface],
      border: bordered ? "1px solid" : "none",
      borderRadius: radius,
      padding,
      boxShadow: elevated ? "var(--shadow-raised)" : "var(--shadow-card)",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Subset self-hosted do Lucide (ISC), copiado verbatim de
   github.com/lucide-icons/lucide/icons/<nome>.svg. Os .svg individuais
   ficam em assets/icons/ (mesmos dados) para uso fora do React. */
const ICONS = {
  "file-text": "<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 9H8\"/><path d=\"M16 13H8\"/><path d=\"M16 17H8\"/>",
  "shield-check": "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/><path d=\"m9 12 2 2 4-4\"/>",
  "circle-check": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m16 9-5.5 5.5L8 12\"/>",
  "circle-alert": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\"/><line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\"/>",
  "info": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4\"/><path d=\"M12 8h.01\"/>",
  "folder-open": "<path d=\"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2\"/>",
  "download": "<path d=\"M12 15V3\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/>",
  "book-open": "<path d=\"M12 5v16\"/><path d=\"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z\"/>",
  "chevron-down": "<path d=\"m6 9 6 6 6-6\"/>",
  "check": "<path d=\"M20 6 9 17l-5-5\"/>",
  "x": "<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>",
  "tablet": "<rect width=\"16\" height=\"20\" x=\"4\" y=\"2\" rx=\"2\" ry=\"2\"/><line x1=\"12\" x2=\"12.01\" y1=\"18\" y2=\"18\"/>",
  "clock": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 6v6l4 2\"/>",
  "hard-drive": "<path d=\"M10 16h.01\"/><path d=\"M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z\"/><path d=\"M21.946 12.013H2.054\"/><path d=\"M6 16h.01\"/>"
};
const ALIASES = {
  "check-circle": "circle-check",
  "alert-circle": "circle-alert"
};

/* Ícones Lucide (ISC) do subset self-hosted em assets/icons — nenhuma
   requisição de rede. Traço 2px, sempre linha, cor por currentColor. */
function Icon({
  name,
  size = 24,
  color = "currentColor",
  strokeWidth = 2,
  style,
  ...rest
}) {
  const key = ALIASES[name] || name;
  const body = ICONS[key];
  if (!body) return null;
  return /*#__PURE__*/React.createElement("svg", _extends({
    role: "img",
    "aria-hidden": "true",
    "data-icon": key,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      display: "inline-block",
      flex: "none",
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: body
    }
  }, rest));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/chrome/FileSummary.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function FileSummary({
  name,
  meta,
  action,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)",
      padding: "var(--space-3)",
      background: "var(--white)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-md)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "file-text",
    size: 28,
    color: "var(--blue-800)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "500 var(--text-body)/1.3 var(--font-sans)",
      color: "var(--text-title)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, name), meta ? /*#__PURE__*/React.createElement("span", {
    className: "fo-caption"
  }, meta) : null), action);
}
Object.assign(__ds_scope, { FileSummary });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chrome/FileSummary.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const base = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-2)",
  minHeight: "var(--touch-target)",
  padding: "0 var(--space-6)",
  border: "1px solid transparent",
  borderRadius: "var(--radius-md)",
  font: "var(--text-body-md-weight) var(--text-body-md)/var(--text-body-md-line) var(--font-sans)",
  cursor: "pointer",
  textDecoration: "none",
  transition: "background-color var(--dur-fast) var(--ease-standard),border-color var(--dur-fast) var(--ease-standard),color var(--dur-fast) var(--ease-standard)"
};
const variants = {
  primary: {
    background: "var(--action-primary)",
    color: "var(--text-on-brand)"
  },
  secondary: {
    background: "var(--white)",
    color: "var(--blue-800)",
    borderColor: "var(--gray-300)"
  },
  ghost: {
    background: "transparent",
    color: "var(--blue-800)",
    padding: "0 var(--space-3)"
  },
  success: {
    background: "var(--green-600)",
    color: "var(--white)"
  }
};
const hovers = {
  primary: {
    background: "var(--action-primary-hover)"
  },
  secondary: {
    background: "var(--beige)",
    borderColor: "var(--blue-700)"
  },
  ghost: {
    background: "var(--blue-100)"
  },
  success: {
    background: "var(--green-700)"
  }
};
function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconEnd,
  fullWidth = false,
  disabled = false,
  as = "button",
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const Tag = as;
  const sized = size === "sm" ? {
    minHeight: 36,
    padding: variant === "ghost" ? "0 var(--space-2)" : "0 var(--space-4)",
    fontSize: "var(--text-caption)",
    fontWeight: 500
  } : size === "lg" ? {
    minHeight: 52,
    padding: "0 var(--space-8)"
  } : null;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    disabled: Tag === "button" ? disabled : undefined,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setPress(false);
    },
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false),
    style: {
      ...base,
      ...variants[variant],
      ...sized,
      width: fullWidth ? "100%" : undefined,
      ...(hover && !disabled ? hovers[variant] : null),
      ...(press && !disabled ? {
        transform: "translateY(1px)"
      } : null),
      ...(disabled ? {
        opacity: 0.45,
        cursor: "not-allowed"
      } : null),
      ...style
    }
  }, rest), icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: size === "sm" ? 16 : 20
  }) : null, children, iconEnd ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconEnd,
    size: size === "sm" ? 16 : 20
  }) : null);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const tones = {
  neutral: {
    background: "var(--beige-200)",
    color: "var(--gray-700)",
    border: "var(--gray-300)"
  },
  brand: {
    background: "var(--blue-100)",
    color: "var(--blue-800)",
    border: "var(--gray-300)"
  },
  success: {
    background: "var(--green-100)",
    color: "var(--green-700)",
    border: "var(--green-700)"
  },
  warning: {
    background: "var(--amber-100)",
    color: "var(--amber-700)",
    border: "var(--amber-600)"
  },
  error: {
    background: "var(--red-100)",
    color: "var(--red-700)",
    border: "var(--red-700)"
  }
};
function Tag({
  children,
  tone = "neutral",
  icon,
  style,
  ...rest
}) {
  const t = tones[tone];
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "var(--space-1)",
      padding: "var(--space-1) var(--space-2)",
      background: t.background,
      color: t.color,
      border: `1px solid ${t.border}`,
      borderRadius: "var(--radius-sm)",
      font: "500 var(--text-caption)/var(--text-caption-line) var(--font-sans)",
      ...style
    }
  }, rest), icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 16
  }) : null, children);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Callout.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const tones = {
  info: {
    bg: "var(--blue-100)",
    border: "var(--blue-600)",
    fg: "var(--blue-800)",
    icon: "info"
  },
  warning: {
    bg: "var(--amber-100)",
    border: "var(--amber-600)",
    fg: "var(--amber-700)",
    icon: "info"
  },
  success: {
    bg: "var(--green-100)",
    border: "var(--green-700)",
    fg: "var(--green-700)",
    icon: "circle-check"
  },
  error: {
    bg: "var(--red-100)",
    border: "var(--red-700)",
    fg: "var(--red-700)",
    icon: "circle-alert"
  }
};
function Callout({
  tone = "info",
  title,
  children,
  icon,
  actions,
  style,
  ...rest
}) {
  const t = tones[tone];
  return /*#__PURE__*/React.createElement("div", _extends({
    role: tone === "error" ? "alert" : "status",
    style: {
      display: "flex",
      gap: "var(--space-3)",
      padding: "var(--space-4)",
      background: t.bg,
      border: `1px solid ${t.border}`,
      borderRadius: "var(--radius-md)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon || t.icon,
    size: 24,
    color: t.fg,
    style: {
      marginTop: 2
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-2)",
      minWidth: 0
    }
  }, title ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--text-heading-weight) var(--text-heading)/var(--text-heading-line) var(--font-sans)",
      color: t.fg
    }
  }, title) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--text-body-weight) var(--text-body)/var(--text-body-line) var(--font-sans)",
      color: "var(--gray-700)"
    }
  }, children), actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)",
      flexWrap: "wrap",
      marginTop: "var(--space-1)"
    }
  }, actions) : null));
}
Object.assign(__ds_scope, { Callout });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Callout.jsx", error: String((e && e.message) || e) }); }

// components/feedback/LocalBadge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Selo permanente de privacidade. Especificação fixa: pill, fundo --blue-100,
   borda 1px --gray-300, ícone shield-check 20px --blue-800, texto caption 500.
   Nunca verde, nunca vermelho, nunca cadeado genérico, nunca animado. */
function LocalBadge({
  children = "100% local",
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "var(--space-2)",
      padding: "var(--space-1) var(--space-3)",
      background: "var(--blue-100)",
      border: "1px solid var(--gray-300)",
      borderRadius: "var(--radius-md)",
      font: "500 var(--text-caption)/var(--text-caption-line) var(--font-sans)",
      color: "var(--blue-800)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "shield-check",
    size: 20,
    color: "var(--blue-800)"
  }), children);
}
Object.assign(__ds_scope, { LocalBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/LocalBadge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/ProgressPhase.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ProgressPhase({
  label,
  counter,
  percent = 0,
  state = "pending",
  indeterminate = false,
  style,
  ...rest
}) {
  const done = state === "done";
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      opacity: state === "pending" ? 0.45 : 1,
      transition: "opacity var(--dur-slow) var(--ease-standard)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)",
      marginBottom: "var(--space-1)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 20,
      display: "grid",
      placeItems: "center"
    }
  }, done ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 18,
    color: "var(--green-700)"
  }) : null), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      font: "500 var(--text-body-md)/var(--text-body-md-line) var(--font-sans)",
      color: "var(--text-title)"
    }
  }, label), counter ? /*#__PURE__*/React.createElement("span", {
    className: "fo-caption"
  }, counter) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 10,
      borderRadius: "var(--radius-pill)",
      background: "var(--beige-200)",
      border: "1px solid var(--border-default)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: indeterminate ? "40%" : `${Math.max(0, Math.min(100, percent))}%`,
      borderRadius: "var(--radius-pill)",
      background: "var(--progress-fill)",
      transition: "width var(--dur-slow) var(--ease-standard)",
      animation: indeterminate ? "foliant-indeterminate 1.1s ease-in-out infinite" : undefined
    }
  })), /*#__PURE__*/React.createElement("style", null, "@keyframes foliant-indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}"));
}
Object.assign(__ds_scope, { ProgressPhase });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/ProgressPhase.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Checkbox({
  label,
  help,
  checked,
  onChange,
  id,
  style,
  ...rest
}) {
  const [internal, setInternal] = React.useState(!!checked);
  const on = checked ?? internal;
  const boxId = id || React.useId();
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: boxId,
    style: {
      display: "flex",
      gap: "var(--space-2)",
      alignItems: "flex-start",
      cursor: "pointer",
      minHeight: "var(--touch-target)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    id: boxId,
    type: "checkbox",
    checked: on,
    onChange: e => {
      setInternal(e.target.checked);
      onChange && onChange(e.target.checked);
    },
    style: {
      position: "absolute",
      opacity: 0,
      width: 1,
      height: 1
    }
  }, rest)), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      flex: "none",
      width: 22,
      height: 22,
      marginTop: 3,
      display: "grid",
      placeItems: "center",
      borderRadius: "var(--radius-sm)",
      border: `1px solid ${on ? "var(--blue-800)" : "var(--border-default)"}`,
      background: on ? "var(--blue-800)" : "var(--white)",
      transition: "background-color var(--dur-fast) var(--ease-standard)"
    }
  }, on ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 16,
    color: "var(--white)"
  }) : null), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "fo-body"
  }, label), help ? /*#__PURE__*/React.createElement("span", {
    className: "fo-caption"
  }, help) : null));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Disclosure.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Disclosure({
  summary,
  children,
  open,
  defaultOpen = false,
  surface = "sunken",
  style,
  ...rest
}) {
  const [internal, setInternal] = React.useState(defaultOpen);
  const isOpen = open ?? internal;
  const bg = surface === "sunken" ? "var(--surface-sunken)" : surface === "card" ? "var(--surface-card)" : "transparent";
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: bg,
      border: surface === "plain" ? "none" : "1px solid var(--border-default)",
      borderRadius: "var(--radius-md)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setInternal(!isOpen),
    "aria-expanded": isOpen,
    style: {
      width: "100%",
      minHeight: "var(--touch-target)",
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)",
      padding: "var(--space-2) var(--space-3)",
      background: "none",
      border: "none",
      borderRadius: "var(--radius-md)",
      cursor: "pointer",
      textAlign: "left",
      font: "var(--text-body-md-weight) var(--text-body-md)/var(--text-body-md-line) var(--font-sans)",
      color: "var(--text-title)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, summary), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 20,
    color: "var(--blue-800)",
    style: {
      transform: isOpen ? "rotate(180deg)" : "none",
      transition: "transform var(--dur-base) var(--ease-standard)"
    }
  })), isOpen ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 var(--space-3) var(--space-3)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)"
    }
  }, children) : null);
}
Object.assign(__ds_scope, { Disclosure });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Disclosure.jsx", error: String((e && e.message) || e) }); }

// components/forms/DropZone.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function DropZone({
  title = "Arraste seu PDF aqui",
  hint = "ou",
  action,
  note,
  active = false,
  onActivate,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const on = active || hover;
  return /*#__PURE__*/React.createElement("div", _extends({
    onDragOver: e => {
      e.preventDefault();
      setHover(true);
    },
    onDragLeave: () => setHover(false),
    onDrop: e => {
      e.preventDefault();
      setHover(false);
      onActivate && onActivate();
    },
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "var(--space-3)",
      padding: "var(--space-8) var(--space-6)",
      background: on ? "var(--surface-brand-tint)" : "var(--surface-sunken)",
      border: on ? "2px solid var(--blue-700)" : "2px dashed var(--border-default)",
      borderRadius: "var(--radius-lg)",
      textAlign: "center",
      transition: "background-color var(--dur-base) var(--ease-standard),border-color var(--dur-base) var(--ease-standard)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "file-text",
    size: 40,
    color: on ? "var(--blue-800)" : "var(--gray-500)"
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--text-heading-weight) var(--text-heading)/var(--text-heading-line) var(--font-sans)",
      color: on ? "var(--blue-800)" : "var(--text-title)"
    }
  }, title), hint ? /*#__PURE__*/React.createElement("span", {
    className: "fo-caption"
  }, hint) : null, action, note ? /*#__PURE__*/React.createElement("span", {
    className: "fo-caption",
    style: {
      maxWidth: 380
    }
  }, note) : null);
}
Object.assign(__ds_scope, { DropZone });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/DropZone.jsx", error: String((e && e.message) || e) }); }

// components/forms/SegmentedControl.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SegmentedControl({
  options = [],
  value,
  onChange,
  label,
  style,
  ...rest
}) {
  const [internal, setInternal] = React.useState(value ?? options[0]);
  const current = value ?? internal;
  const pick = opt => {
    setInternal(opt);
    onChange && onChange(opt);
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-1)",
      ...style
    }
  }, rest), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--text-body-md-weight) var(--text-body-md)/var(--text-body-md-line) var(--font-sans)",
      color: "var(--text-title)"
    }
  }, label) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)",
      flexWrap: "wrap"
    }
  }, options.map(opt => {
    const active = opt === current;
    return /*#__PURE__*/React.createElement("button", {
      key: opt,
      type: "button",
      onClick: () => pick(opt),
      style: {
        minHeight: "var(--touch-target)",
        padding: "0 var(--space-4)",
        borderRadius: "var(--radius-sm)",
        border: `1px solid ${active ? "var(--blue-800)" : "var(--border-default)"}`,
        background: active ? "var(--blue-800)" : "var(--white)",
        color: active ? "var(--white)" : "var(--text-body-color)",
        font: "500 var(--text-body-md)/1 var(--font-sans)",
        cursor: "pointer",
        transition: "background-color var(--dur-fast) var(--ease-standard),border-color var(--dur-fast) var(--ease-standard)"
      }
    }, opt);
  })));
}
Object.assign(__ds_scope, { SegmentedControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SegmentedControl.jsx", error: String((e && e.message) || e) }); }

// components/forms/TextField.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function TextField({
  label,
  help,
  value,
  placeholder,
  type = "text",
  readOnly = false,
  invalid = false,
  id,
  action,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const inputId = id || React.useId();
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-1)",
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      font: "var(--text-body-md-weight) var(--text-body-md)/var(--text-body-md-line) var(--font-sans)",
      color: "var(--text-title)"
    }
  }, label) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    type: type,
    defaultValue: value,
    placeholder: placeholder,
    readOnly: readOnly,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      minWidth: 0,
      minHeight: "var(--touch-target)",
      padding: "0 var(--space-3)",
      background: "var(--white)",
      color: "var(--text-body-color)",
      font: "var(--text-body-weight) var(--text-body)/var(--text-body-line) var(--font-sans)",
      border: `1px solid ${invalid ? "var(--red-700)" : focus ? "var(--blue-600)" : "var(--border-default)"}`,
      borderRadius: "var(--radius-sm)",
      boxShadow: focus ? "var(--ring-focus)" : "none",
      outline: "none",
      textOverflow: "ellipsis",
      transition: "border-color var(--dur-fast) var(--ease-standard),box-shadow var(--dur-fast) var(--ease-standard)"
    }
  }, rest)), action), help ? /*#__PURE__*/React.createElement("span", {
    className: "fo-caption"
  }, help) : null);
}
Object.assign(__ds_scope, { TextField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/TextField.jsx", error: String((e && e.message) || e) }); }

// ui_kits/foliant-app/ScreensConvert.jsx
try { (() => {
const {
  AppWindow,
  LocalBadge,
  Button,
  Card,
  Tag,
  Callout,
  ProgressPhase,
  TextField,
  SegmentedControl,
  Checkbox,
  Disclosure,
  FileSummary,
  Icon
} = window.FoliantDesignSystem_b90fff;
function PreviewScreen({
  onNext,
  onBack
}) {
  return /*#__PURE__*/React.createElement(AppWindow, {
    title: "Foliant",
    badge: /*#__PURE__*/React.createElement(LocalBadge, null),
    width: 620
  }, /*#__PURE__*/React.createElement(FileSummary, {
    name: "apostila-direito-adm.pdf",
    meta: "903 p\xE1ginas \xB7 108 MB",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      onClick: onBack
    }, "Trocar")
  }), /*#__PURE__*/React.createElement(Card, {
    surface: "card",
    padding: "var(--space-4)"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "fo-heading",
    style: {
      marginBottom: "var(--space-3)"
    }
  }, "O que vai acontecer"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)",
      flexWrap: "wrap",
      marginBottom: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement(Tag, {
    tone: "brand"
  }, "41 p\xE1ginas com texto"), /*#__PURE__*/React.createElement(Tag, {
    tone: "warning"
  }, "862 p\xE1ginas escaneadas")), /*#__PURE__*/React.createElement("p", {
    className: "fo-body"
  }, "41 p\xE1ginas j\xE1 t\xEAm texto de verdade. As outras 862 s\xE3o imagem escaneada \u2014 o Foliant vai reconhecer o texto delas letra por letra."), /*#__PURE__*/React.createElement("p", {
    className: "fo-body",
    style: {
      marginTop: "var(--space-2)"
    }
  }, "\xC9 por isso que demora. No fim, o livro fica com fonte ajust\xE1vel e busca por palavra.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-4)",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 180
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "fo-caption"
  }, "Tempo estimado"), /*#__PURE__*/React.createElement("p", {
    className: "fo-body",
    style: {
      color: "var(--text-title)"
    }
  }, "~35 min")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 2,
      minWidth: 220
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "fo-caption"
  }, "Salva em"), /*#__PURE__*/React.createElement("p", {
    className: "fo-body",
    style: {
      color: "var(--text-title)",
      wordBreak: "break-all"
    }
  }, "\u2026/apostila-direito-adm.epub ", /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault()
  }, "alterar")))), /*#__PURE__*/React.createElement(Disclosure, {
    summary: "Ajustar t\xEDtulo e autor do livro"
  }, /*#__PURE__*/React.createElement(TextField, {
    label: "T\xEDtulo",
    placeholder: "apostila-direito-adm",
    help: "\xC9 o nome que vai aparecer na estante do seu aparelho."
  }), /*#__PURE__*/React.createElement(TextField, {
    label: "Autor",
    placeholder: "Desconhecido"
  }), /*#__PURE__*/React.createElement(SegmentedControl, {
    label: "Idioma do livro",
    options: ["Português", "Inglês", "Espanhol"]
  }), /*#__PURE__*/React.createElement("p", {
    className: "fo-caption"
  }, "Ajuda o reconhecimento a acertar acentos e cedilhas.")), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    fullWidth: true,
    onClick: onNext
  }, "Converter para EPUB"), /*#__PURE__*/React.createElement(Checkbox, {
    label: "Continua tudo no seu computador",
    checked: true
  }));
}
function ConvertingScreen({
  onNext,
  onError
}) {
  const [page, setPage] = React.useState(473);
  React.useEffect(() => {
    const t = setInterval(() => setPage(p => p < 903 ? p + 7 : p), 400);
    return () => clearInterval(t);
  }, []);
  const pct = Math.round(page / 903 * 100);
  return /*#__PURE__*/React.createElement(AppWindow, {
    title: "Foliant \u2014 convertendo",
    badge: /*#__PURE__*/React.createElement(LocalBadge, null),
    width: 620
  }, /*#__PURE__*/React.createElement("p", {
    className: "fo-heading"
  }, "apostila-direito-adm.pdf"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(ProgressPhase, {
    label: "Lendo as p\xE1ginas",
    counter: `${page} de 903`,
    percent: pct,
    state: page >= 903 ? "done" : "active"
  }), /*#__PURE__*/React.createElement(ProgressPhase, {
    label: "Montando o livro",
    state: page >= 903 ? "active" : "pending",
    indeterminate: page >= 903
  }), /*#__PURE__*/React.createElement(ProgressPhase, {
    label: "Fechando o EPUB",
    state: "pending"
  })), /*#__PURE__*/React.createElement(Callout, {
    tone: "info",
    icon: "circle-check"
  }, "At\xE9 agora: ", Math.max(0, page - 75), " p\xE1ginas reconhecidas a partir da imagem, 41 aproveitadas do texto original. Nenhuma falha."), /*#__PURE__*/React.createElement("p", {
    className: "fo-caption"
  }, "Faltam ~19 min. Pode deixar rodando e usar o computador normalmente."), /*#__PURE__*/React.createElement(Disclosure, {
    summary: "Ver log detalhado",
    surface: "plain"
  }, /*#__PURE__*/React.createElement("pre", {
    style: {
      margin: 0,
      padding: "var(--space-3)",
      background: "var(--beige-200)",
      borderRadius: "var(--radius-md)",
      font: "400 13px/1.6 var(--font-mono)",
      color: "var(--gray-700)",
      maxHeight: 120,
      overflow: "auto"
    }
  }, `página ${page}: texto reconhecido
página ${page - 1}: texto reconhecido
página ${page - 2}: texto já existente, aproveitado`)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)",
      justifyContent: "flex-end"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: onError
  }, "Simular falha"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary"
  }, "Cancelar"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: onNext
  }, "Ir para o resultado")));
}
Object.assign(window, {
  PreviewScreen,
  ConvertingScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/foliant-app/ScreensConvert.jsx", error: String((e && e.message) || e) }); }

// ui_kits/foliant-app/ScreensResult.jsx
try { (() => {
const {
  AppWindow,
  LocalBadge,
  Button,
  Card,
  Callout,
  Disclosure,
  SegmentedControl,
  Icon
} = window.FoliantDesignSystem_b90fff;
const guides = {
  "Tablet Android": ["Suba o .epub para o Google Drive ou OneDrive.", "No tablet, abra o app do Drive e baixe o arquivo.", "Toque no arquivo e escolha Moon+ Reader ou Xodo."],
  Kindle: ["Conecte o Kindle ao computador pelo cabo USB.", "Copie o .epub para a pasta Documents do aparelho.", "Desconecte: o livro aparece na sua biblioteca."],
  iPad: ["Envie o .epub para você mesmo pelo AirDrop ou e-mail.", "Toque no arquivo e escolha Copiar para Livros.", "O livro fica na estante do app Livros."]
};
function SuccessScreen({
  onRestart,
  warning = false
}) {
  const [device, setDevice] = React.useState("Tablet Android");
  return /*#__PURE__*/React.createElement(AppWindow, {
    title: "Foliant",
    badge: /*#__PURE__*/React.createElement(LocalBadge, null),
    width: 620
  }, warning ? /*#__PURE__*/React.createElement(Callout, {
    tone: "warning",
    title: "Seu livro est\xE1 pronto, com uma ressalva"
  }, "61 das 903 p\xE1ginas estavam tortas ou muito claras no original, e o texto delas pode ter erros. As outras 842 ficaram boas.", /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault()
  }, "Ver a lista de p\xE1ginas"))) : /*#__PURE__*/React.createElement(Callout, {
    tone: "success",
    title: "Pronto. Seu livro est\xE1 convertido."
  }, "903 p\xE1ginas, com texto pesquis\xE1vel e fonte ajust\xE1vel.", /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-1)",
      wordBreak: "break-all",
      color: "var(--gray-500)"
    }
  }, "\u2026/apostila-direito-adm.epub")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "success",
    icon: "book-open"
  }, "Abrir EPUB"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: "folder-open"
  }, "Ver na pasta")), /*#__PURE__*/React.createElement(Card, {
    surface: "card",
    padding: "var(--space-4)"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "fo-heading",
    style: {
      marginBottom: "var(--space-3)"
    }
  }, "Como levar para o seu aparelho"), /*#__PURE__*/React.createElement(SegmentedControl, {
    options: Object.keys(guides),
    value: device,
    onChange: setDevice
  }), /*#__PURE__*/React.createElement("ol", {
    style: {
      margin: "var(--space-3) 0 0",
      paddingLeft: 20,
      font: "var(--text-body-weight) var(--text-body)/var(--text-body-line) var(--font-sans)",
      color: "var(--gray-700)"
    }
  }, guides[device].map(s => /*#__PURE__*/React.createElement("li", {
    key: s,
    style: {
      marginBottom: "var(--space-1)"
    }
  }, s))), /*#__PURE__*/React.createElement("p", {
    className: "fo-caption",
    style: {
      marginTop: "var(--space-3)"
    }
  }, "Se o app de leitura n\xE3o achar o livro, abra o gerenciador de arquivos, toque no .epub e use \u201CAbrir com\u201D. \xC9 comum e n\xE3o significa que a convers\xE3o falhou.")), /*#__PURE__*/React.createElement(Disclosure, {
    summary: "Ver log detalhado",
    surface: "plain"
  }, /*#__PURE__*/React.createElement("pre", {
    style: {
      margin: 0,
      padding: "var(--space-3)",
      background: "var(--beige-200)",
      borderRadius: "var(--radius-md)",
      font: "400 13px/1.6 var(--font-mono)",
      color: "var(--gray-700)"
    }
  }, `903 páginas processadas
862 reconhecidas a partir da imagem
41 aproveitadas do texto original`)), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    fullWidth: true,
    onClick: onRestart
  }, "Converter outro PDF"));
}
function ErrorScreen({
  onRetry
}) {
  return /*#__PURE__*/React.createElement(AppWindow, {
    title: "Foliant",
    badge: /*#__PURE__*/React.createElement(LocalBadge, null),
    width: 620
  }, /*#__PURE__*/React.createElement(Callout, {
    tone: "error",
    title: "A convers\xE3o parou na p\xE1gina 214.",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      onClick: onRetry
    }, "Tentar de novo"), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary"
    }, "Ver log detalhado"))
  }, "O PDF parece estar danificado nessa p\xE1gina. O que j\xE1 foi feito n\xE3o foi perdido \u2014 o Foliant retoma de onde parou."), /*#__PURE__*/React.createElement("p", {
    className: "fo-caption"
  }, "Se acontecer de novo na mesma p\xE1gina, vale tentar baixar o PDF outra vez da fonte original."));
}
Object.assign(window, {
  SuccessScreen,
  ErrorScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/foliant-app/ScreensResult.jsx", error: String((e && e.message) || e) }); }

// ui_kits/foliant-app/ScreensStart.jsx
try { (() => {
const {
  AppWindow,
  LocalBadge,
  Button,
  Card,
  Tag,
  Callout,
  ProgressPhase,
  DropZone,
  TextField,
  SegmentedControl,
  Checkbox,
  Disclosure,
  FileSummary,
  Icon
} = window.FoliantDesignSystem_b90fff;
function ScreenTitle({
  children,
  sub
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("h1", {
    className: "fo-display"
  }, children), sub ? /*#__PURE__*/React.createElement("p", {
    className: "fo-caption"
  }, sub) : null);
}
function GatekeeperScreen({
  onNext
}) {
  return /*#__PURE__*/React.createElement(AppWindow, {
    title: "Foliant",
    width: 620
  }, /*#__PURE__*/React.createElement(ScreenTitle, {
    sub: "Converter PDF escaneado para EPUB"
  }, "Foliant"), /*#__PURE__*/React.createElement(Callout, {
    tone: "warning",
    title: "Isso \xE9 normal na primeira abertura"
  }, "O macOS avisa que n\xE3o conhece o desenvolvedor de programas gratuitos como este. O Foliant continua sendo o mesmo arquivo que voc\xEA baixou.", /*#__PURE__*/React.createElement("ol", {
    style: {
      margin: "var(--space-3) 0 0",
      paddingLeft: 20,
      lineHeight: 1.7
    }
  }, /*#__PURE__*/React.createElement("li", null, "Clique com o bot\xE3o direito no \xEDcone do Foliant."), /*#__PURE__*/React.createElement("li", null, "Escolha ", /*#__PURE__*/React.createElement("strong", null, "Abrir"), " no menu."), /*#__PURE__*/React.createElement("li", null, "Confirme ", /*#__PURE__*/React.createElement("strong", null, "Abrir"), " na janela do sistema."))), /*#__PURE__*/React.createElement("p", {
    className: "fo-caption",
    style: {
      textAlign: "center"
    }
  }, "Voc\xEA faz isso uma vez. Nas pr\xF3ximas vezes o app abre com um clique."), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    fullWidth: true,
    onClick: onNext
  }, "Entendi, vamos come\xE7ar"));
}
function SelectScreen({
  onNext
}) {
  const [dragging, setDragging] = React.useState(false);
  return /*#__PURE__*/React.createElement(AppWindow, {
    title: "Foliant",
    badge: /*#__PURE__*/React.createElement(LocalBadge, null),
    width: 620
  }, /*#__PURE__*/React.createElement(ScreenTitle, {
    sub: "Converter PDF escaneado para EPUB"
  }, "Foliant"), /*#__PURE__*/React.createElement(DropZone, {
    active: dragging,
    title: dragging ? "Solte para começar" : "Arraste seu PDF aqui",
    hint: dragging ? null : "ou",
    action: dragging ? null : /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      icon: "folder-open",
      onClick: onNext
    }, "Selecionar arquivo\u2026"),
    note: dragging ? null : "Aceita PDF de qualquer tamanho — inclusive apostilas de centenas de MB.",
    onActivate: onNext
  }), /*#__PURE__*/React.createElement(Card, {
    surface: "brandTint",
    padding: "var(--space-3)"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield-check",
    size: 24,
    color: "var(--blue-800)"
  }), /*#__PURE__*/React.createElement("p", {
    className: "fo-caption",
    style: {
      color: "var(--gray-700)"
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "var(--blue-800)"
    }
  }, "100% no seu computador."), " O arquivo n\xE3o \xE9 enviado para nenhum servidor. Funciona sem internet e em m\xE1quina antiga."))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onMouseDown: () => setDragging(!dragging)
  }, dragging ? "Sair do estado de arraste" : "Simular arquivo sobre a janela")));
}
Object.assign(window, {
  ScreenTitle,
  GatekeeperScreen,
  SelectScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/foliant-app/ScreensStart.jsx", error: String((e && e.message) || e) }); }

__ds_ns.AppWindow = __ds_scope.AppWindow;

__ds_ns.FileSummary = __ds_scope.FileSummary;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Callout = __ds_scope.Callout;

__ds_ns.LocalBadge = __ds_scope.LocalBadge;

__ds_ns.ProgressPhase = __ds_scope.ProgressPhase;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Disclosure = __ds_scope.Disclosure;

__ds_ns.DropZone = __ds_scope.DropZone;

__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

__ds_ns.TextField = __ds_scope.TextField;

})();
