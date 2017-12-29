const pdfjs = require('pdfjs')
const PDFDictionary = require('pdfjs/lib/object/dictionary')
const zlib = require('zlib')
const EmbeddedPdf = require('./EmbeddedPdf')

module.exports = (contentBuffer, headerBuffer, box, rotation, pageIndex, xObjIndex) => {
  const extContent = new pdfjs.ExternalDocument(contentBuffer)
  const doc = new pdfjs.Document({
    font: new pdfjs.Font(require('pdfjs/font/helvetica.json'))
  })
  const xobj = new EmbeddedPdf(headerBuffer, box)
  const headerStream = xobj.page.get('Contents').object.content
  headerStream.content = zlib.unzipSync(headerStream.content).toString('ascii')
  headerStream.content = headerStream.content.replace('\nf\n', '\n')
  console.log(headerStream.content)

  headerStream.object.prop('Length', headerStream.content.length)
  headerStream.object.prop('Filter', null)
  doc._doc._useXObject(xobj)

  function addToPage (page) {
    const xobjKey = Object.keys(doc._doc._xobjects).find((k) => doc._doc._xobjects[k].x === xobj)
    const resourcesOrRef = page.object.properties.get('Resources')
    const resources = resourcesOrRef.object ? resourcesOrRef.object.properties : resourcesOrRef

    const xnum = `X${xObjIndex}.0`
    if (resources.has('XObject')) {
      resources.get('XObject').add(xnum, doc._doc._xobjects[xobjKey].o[0].reference)
    } else {
      resources.set('XObject', new PDFDictionary({
        [xnum]: doc._doc._xobjects[xobjKey].o[0].reference
      }))
    }
    const stream = page.object.properties.get('Contents').object.content
    if (stream.object.properties.get('Filter')) {
      stream.content = zlib.unzipSync(stream.content).toString('ascii')
    } else {
      stream.content = stream.toString()
    }

    /* stream.content = 'q\n' + stream.content + '\nQ\n'
    stream.writeLine('q')
    stream.writeLine(rotation || '1 0 0 1 0 0 cm')
    stream.writeLine(`/${xnum} Do`)
    stream.writeLine('Q') */

    stream.content = stream.content.replace('\nf\n', '\n')
    stream.content = `q\n1 0 0 1 0 0 cm\n/${xnum} Do\nQ\n` + stream.content
    stream.writeLine('q')
    stream.writeLine('Q')

    stream.object.prop('Filter', null)
  }

  addToPage(extContent.pages.get('Kids')[pageIndex])

  doc.addPagesOf(extContent)
  return doc.asBuffer()
}