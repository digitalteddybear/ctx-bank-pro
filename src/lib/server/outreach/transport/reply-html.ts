import sanitizeHtml from "sanitize-html";
const placeholder = /\{\{\s*(?:message|body|reply)\s*\}\}/gi;
const escape = (text: string) => text.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]!));

/** Shared server renderer for previews and multipart email delivery. */
export function renderReplyHtml(text: string, template?: string): string | undefined {
  if (!template?.trim()) return undefined;
  placeholder.lastIndex = 0;
  if (!placeholder.test(template)) throw new Error("Reply HTML must include {{message}}.");
  placeholder.lastIndex = 0;
  const body = escape(text).replace(/\r?\n/g, "<br>");
  return sanitizeHtml(template.replace(placeholder, () => body), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "html", "head", "body", "img", "center", "style"],
    allowVulnerableTags: true,
    exclusiveFilter: frame => frame.tag === "style" && /@import|expression\s*\(|javascript\s*:|behavior\s*:/i.test(frame.text),
    allowedAttributes: {
      "*": ["style", "class", "id", "align", "valign", "width", "height", "bgcolor", "role", "aria-label"],
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      table: ["cellpadding", "cellspacing", "border", "width", "role", "style", "align"],
      td: ["colspan", "rowspan", "style", "align", "valign", "width", "height", "bgcolor"],
    },
    allowedSchemes: ["https", "http", "mailto", "tel", "cid"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "textarea", "option", "noscript"],
    allowedStyles: {
      "*": {
        color: [/^[#\w\s(),.%/-]+$/],
        "background-color": [/^[#\w\s(),.%/-]+$/],
        "font-family": [/^[\w\s,'"-]+$/],
        "font-size": [/^[\d.]+(?:px|pt|em|rem|%)$/],
        "font-weight": [/^(?:normal|bold|[1-9]00)$/],
        "line-height": [/^[\d.]+(?:px|pt|em|rem|%)?$/],
        "text-align": [/^(?:left|right|center|justify)$/],
        "text-decoration": [/^(?:none|underline|line-through)$/],
        padding: [/^[\d.\s]+(?:px|pt|em|rem|%)(?:[\d.\spxptemr%]*)$/],
        margin: [/^[\d.\s]+(?:px|pt|em|rem|%)(?:[\d.\spxptemr%]*)$/],
        width: [/^(?:auto|[\d.]+(?:px|pt|em|rem|%))$/],
        "max-width": [/^[\d.]+(?:px|pt|em|rem|%)$/],
        height: [/^(?:auto|[\d.]+(?:px|pt|em|rem|%))$/],
        border: [/^[\w\s#().,%/-]+$/],
        "border-radius": [/^[\d.\s]+(?:px|pt|em|rem|%)$/],
        "border-collapse": [/^(?:collapse|separate)$/],
        display: [/^(?:block|inline|inline-block|table|table-cell|none)$/],
      },
    },
  });
}
