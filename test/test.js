const JsReport = require('jsreport-core')
const Promise = require('bluebird')
const parsePdf = require('../lib/utils/parsePdf')
require('should')

describe('pdf utils', () => {
  let jsreport

  beforeEach(async () => {
    jsreport = JsReport({ tasks: { strategy: 'in-process' } })
    jsreport.use(require('jsreport-templates')())
    jsreport.use(require('jsreport-chrome-pdf')())
    jsreport.use(require('jsreport-handlebars')())
    jsreport.use(require('../')())
    return jsreport.init()
  })

  it('should be able to merge in a header', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: '<div style"height: 2cm">header</div>',
      shortid: 'header',
      engine: 'none',
      recipe: 'chrome-pdf'
    })

    const result = await jsreport.render({
      template: {
        content: 'foo',
        engine: 'none',
        recipe: 'chrome-pdf',
        pdfUtils: {
          headerTemplateShortid: 'header'
        },
        chrome: {
          marginTop: '3cm'
        }
      }
    })

    const parsedPdf = await parsePdf(result.content)
    parsedPdf.pages[0].texts.find((t) => t === 'foo').should.be.ok()
    parsedPdf.pages[0].texts.find((t) => t === 'header').should.be.ok()
  })

  it('should be able to merge header with pageCount', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: '{{$pdf.pageNumber}}/{{$pdf.pages.length}}',
      shortid: 'header',
      engine: 'handlebars',
      recipe: 'chrome-pdf'
    })

    const result = await jsreport.render({
      template: {
        content: `<h1 style='page-break-before: always'>Hello</h1><h1 style='page-break-before: always'>Hello</h1>`,
        engine: 'none',
        recipe: 'chrome-pdf',
        pdfUtils: {
          headerTemplateShortid: 'header',
          headerBox: '0 297mm 217mm 297mm'// [0, 792 - this.height, 612, 792]
        }
      }
    })

    const parsedPdf = await parsePdf(result.content)

    parsedPdf.pages[0].texts.find((t) => t === '1/2').should.be.ok()
    parsedPdf.pages[1].texts.find((t) => t === '2/2').should.be.ok()
  })

  it('should be able to merge header and footer at once', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: 'header',
      shortid: 'header',
      engine: 'handlebars',
      recipe: 'chrome-pdf'
    })

    await jsreport.documentStore.collection('templates').insert({
      content: 'footer',
      shortid: 'footer',
      engine: 'handlebars',
      recipe: 'chrome-pdf'
    })

    const result = await jsreport.render({
      template: {
        content: `Foo`,
        engine: 'none',
        recipe: 'chrome-pdf',
        pdfUtils: {
          headerTemplateShortid: 'header',
          headerBox: '0 297mm 217mm 297mm',
          footerTemplateShortid: 'footer',
          footerBox: '0 0mm 217mm 10mm'
        }
      }
    })

    const parsedPdf = await parsePdf(result.content)
    parsedPdf.pages[0].texts.find((t) => t === 'header').should.be.ok()
    parsedPdf.pages[0].texts.find((t) => t === 'footer').should.be.ok()
  })

  it('should be able append pages from another template', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: 'another page',
      shortid: 'anotherPage',
      engine: 'handlebars',
      recipe: 'chrome-pdf',
      chrome: {
        landscape: true
      }
    })

    const result = await jsreport.render({
      template: {
        content: `foo`,
        engine: 'none',
        recipe: 'chrome-pdf',
        pdfUtils: {
          appendTemplateShortid: 'anotherPage'
        }
      }
    })

    const parsedPdf = await parsePdf(result.content)
    require('fs').writeFileSync('out.pdf', result.content)
    parsedPdf.pages[0].texts.find((t) => t === 'foo').should.be.ok()
    parsedPdf.pages[1].texts.find((t) => t === 'another page').should.be.ok()
  })
})

/*
function getPageId(data) {
    let currentPageIndex = data.$pdf.pageNumber
    while(currentPageIndex-- > 0) {
        const pageid = data.$pdf.pages[currentPageIndex].texts.find((t) => t.startsWith('pageid'))
        if (pageid) {
            return pageid.split('-')[1]
        }
    }
}
*/
