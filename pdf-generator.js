// GeoNEXA AI — dependency-free PDF generator for GitHub Pages
// Creates a simple text PDF in the browser, so the Download PDF button
// does not depend on a third-party CDN being reachable.
(function (global) {
  function cleanText(value) {
    return String(value ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
  }
  function esc(s) {
    return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }
  function wrap(text, maxChars) {
    const out = [];
    for (const paragraph of cleanText(text).split("\n")) {
      if (!paragraph) { out.push(""); continue; }
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        if ((line + " " + word).trim().length > maxChars && line) {
          out.push(line); line = word;
        } else line = (line ? line + " " : "") + word;
      }
      if (line) out.push(line);
    }
    return out;
  }
  function makePDF(title, metaLines, body) {
    const lines = [];
    lines.push(cleanText(title));
    lines.push("");
    metaLines.forEach(x => lines.push(cleanText(x)));
    lines.push("");
    lines.push(...wrap(body, 92));

    const pages = [];
    const perPage = 44;
    for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
    if (!pages.length) pages.push([cleanText(title)]);

    const objects = [];
    const add = s => { objects.push(s); return objects.length; };
    const catalog = add("<< /Type /Catalog /Pages 2 0 R >>");
    const pagesObjIndex = add(null);
    const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const pageRefs = [];

    pages.forEach(pageLines => {
      let stream = "BT\n/F1 11 Tf\n50 760 Td\n14 TL\n";
      pageLines.forEach((line, idx) => {
        const size = idx === 0 ? 16 : 11;
        if (idx === 0) stream += `/F1 ${size} Tf\n`;
        stream += `(${esc(line)}) Tj\n0 -14 Td\n`;
      });
      stream += "ET\n";
      const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
      const page = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`);
      pageRefs.push(page);
    });
    objects[pagesObjIndex - 1] = `<< /Type /Pages /Kids [${pageRefs.map((_, i) => `${pageRefs[i]} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;

    let pdf = "%PDF-1.4\n%GeoNEXA\n";
    const offsets = [0];
    objects.forEach((obj, i) => {
      offsets[i + 1] = pdf.length;
      pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([pdf], { type: "application/pdf" });
  }
  global.GeoNexaPDF = { makePDF };
})(window);
