/* Tạo DOCX thật tại runtime, không đưa file Word lớn vào Git. */
const { createRequire } = require('module');
const JSZip = createRequire(require.resolve('mammoth'))('jszip');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
async function makeDocx(paragraphs, { imageBytes = 0, compression = 'DEFLATE' } = {}) {
  const zip = new JSZip();
  const ns = 'http://schemas.openxmlformats.org/';
  zip.file('[Content_Types].xml', '<Types xmlns="' + ns + 'package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="' + ns + 'package/2006/relationships"><Relationship Id="rId1" Type="' + ns + 'officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/styles.xml', '<w:styles xmlns:w="' + ns + 'wordprocessingml/2006/main"><w:style w:type="character" w:styleId="Strong"><w:name w:val="Strong"/></w:style><w:style w:type="character" w:styleId="Emphasis"><w:name w:val="Emphasis"/></w:style></w:styles>');
  const run = (r) => '<w:r><w:rPr>' + (r.b != null ? '<w:b w:val="' + (r.b ? '1' : '0') + '"/>' : '') + (r.i != null ? '<w:i w:val="' + (r.i ? '1' : '0') + '"/>' : '') + (r.style ? '<w:rStyle w:val="' + esc(r.style) + '"/>' : '') + '</w:rPr>' + (r.br ? '<w:br/>' : '<w:t xml:space="preserve">' + esc(r.t || '') + '</w:t>') + '</w:r>';
  let body = paragraphs.map((p) => '<w:p>' + (typeof p === 'string' ? run({ t: p }) : p.map(run).join('')) + '</w:p>').join('');
  if (imageBytes) {
    zip.file('word/media/image.png', Buffer.alloc(imageBytes, 73), { compression: 'STORE' });
    zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="' + ns + 'package/2006/relationships"><Relationship Id="img1" Type="' + ns + 'officeDocument/2006/relationships/image" Target="media/image.png"/></Relationships>');
    body += '<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Ảnh"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="img1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  }
  zip.file('word/document.xml', '<w:document xmlns:w="' + ns + 'wordprocessingml/2006/main" xmlns:r="' + ns + 'officeDocument/2006/relationships" xmlns:wp="' + ns + 'drawingml/2006/wordprocessingDrawing" xmlns:a="' + ns + 'drawingml/2006/main" xmlns:pic="' + ns + 'drawingml/2006/picture"><w:body>' + body + '</w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer', compression });
}
module.exports = { makeDocx };
