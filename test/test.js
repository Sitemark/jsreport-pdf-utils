const JsReport = require('jsreport-core')
const parsePdf = require('../lib/utils/parsePdf')
const fs = require('fs')
const path = require('path')
require('should')

function initialize (strategy = 'in-process') {
  const jsreport = JsReport({ templatingEngines: { strategy } })
  jsreport.use(require('jsreport-templates')())
  jsreport.use(require('jsreport-chrome-pdf')({
    launchOptions: {
      args: ['--no-sandbox']
    }
  }))
  jsreport.use(require('jsreport-phantom-pdf')())
  jsreport.use(require('jsreport-handlebars')())
  jsreport.use(require('jsreport-jsrender')())
  jsreport.use(require('../')())
  return jsreport.init()
}

describe('pdf utils', () => {
  let jsreport
  beforeEach(async () => (jsreport = await initialize()))
  afterEach(() => jsreport.close())

  it('merge should embed static text', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: '<div style"height: 2cm">header</div>',
      shortid: 'header',
      name: 'header',
      engine: 'none',
      chrome: {
        width: '8cm',
        height: '8cm'
      },
      recipe: 'chrome-pdf'
    })

    const result = await jsreport.render({
      template: {
        content: 'foo',
        name: 'content',
        engine: 'none',
        recipe: 'chrome-pdf',
        pdfOperations: [{ type: 'merge', templateShortid: 'header' }],
        chrome: {
          marginTop: '3cm'
        }
      }
    })

    const parsedPdf = await parsePdf(result.content, true)

    parsedPdf.pages[0].text.includes('foo').should.be.ok()
    parsedPdf.pages[0].text.includes('header').should.be.ok()
  })

  it('merge with renderForEveryPage flag should provide dynamic pageNumber for every page', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: '{{$pdf.pageNumber}}/{{$pdf.pages.length}}',
      shortid: 'header',
      name: 'header',
      engine: 'handlebars',
      recipe: 'chrome-pdf'
    })

    const result = await jsreport.render({
      template: {
        content: `<h1 style='page-break-before: always'>Hello</h1><h1 style='page-break-before: always'>Hello</h1>`,
        engine: 'none',
        name: 'content',
        recipe: 'chrome-pdf',
        pdfOperations: [{ type: 'merge', renderForEveryPage: true, templateShortid: 'header' }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)

    parsedPdf.pages[0].text.includes('1/2').should.be.ok()
    parsedPdf.pages[1].text.includes('2/2').should.be.ok()
  })

  it('merge with renderForEveryPage should be able to use pdfCreatePagesGroup helper', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: '{{#with (lookup $pdf.pages $pdf.pageIndex)}}{{group}}{{/with}}',
      shortid: 'header',
      name: 'header',
      engine: 'handlebars',
      recipe: 'chrome-pdf'
    })

    const result = await jsreport.render({
      template: {
        content: `{{{pdfCreatePagesGroup "SomeText"}}}`,
        engine: 'handlebars',
        name: 'content',
        recipe: 'chrome-pdf',
        pdfOperations: [{ type: 'merge', renderForEveryPage: true, templateShortid: 'header' }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)

    parsedPdf.pages[0].group.should.be.eql('SomeText')
    parsedPdf.pages[0].text.includes('SomeText').should.be.true()
  })

  it('merge with renderForEveryPage should be able to group multiple pages using single pdfCreatePagesGroup helper', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: '{{#with (lookup $pdf.pages $pdf.pageIndex)}}{{group}}{{/with}}',
      shortid: 'header',
      name: 'header',
      engine: 'handlebars',
      recipe: 'chrome-pdf'
    })

    const result = await jsreport.render({
      template: {
        content: `{{{pdfCreatePagesGroup "1"}}}<div style='page-break-before: always'>hello</div>`,
        engine: 'handlebars',
        name: 'content',
        recipe: 'chrome-pdf',
        pdfOperations: [{ type: 'merge', renderForEveryPage: true, templateShortid: 'header' }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)

    parsedPdf.pages[0].group.should.be.eql('1')
    parsedPdf.pages[1].group.should.be.eql('1')
  })

  it('merge with renderForEveryPage should be able to use pdfCreatePagesGroup helper with hash params', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: '{{#with (lookup $pdf.pages $pdf.pageIndex)}}{{group.foo}}{{/with}}',
      shortid: 'header',
      name: 'header',
      engine: 'handlebars',
      recipe: 'chrome-pdf'
    })

    const result = await jsreport.render({
      template: {
        content: `{{{pdfCreatePagesGroup foo="1"}}}`,
        engine: 'handlebars',
        recipe: 'chrome-pdf',
        pdfOperations: [{ type: 'merge', renderForEveryPage: true, templateShortid: 'header' }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)
    parsedPdf.pages[0].text.includes('1').should.be.ok()
  })

  it('merge with renderForEveryPage should be able to use pdfCreatePagesGroup helper and keep number type', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: '{{#with (lookup $pdf.pages $pdf.pageIndex)}}{{test group}}{{/with}}',
      shortid: 'header',
      name: 'header',
      engine: 'handlebars',
      recipe: 'chrome-pdf',
      helpers: 'function test(v) { return typeof v }'
    })

    const result = await jsreport.render({
      template: {
        content: `{{{pdfCreatePagesGroup num}}}`,
        engine: 'handlebars',
        name: 'content',
        recipe: 'chrome-pdf',
        pdfOperations: [{ type: 'merge', renderForEveryPage: true, templateShortid: 'header' }]
      },
      data: {
        num: 1
      }
    })

    const parsedPdf = await parsePdf(result.content, true)
    parsedPdf.pages[0].text.includes('number').should.be.ok()
  })

  it('merge with renderForEveryPage should be able to use pdfCreatePagesGroup helper with hash params with jsrender', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: '{{:$pdf.pages[$pdf.pageIndex].group.foo}}',
      shortid: 'header',
      name: 'header',
      engine: 'jsrender',
      recipe: 'chrome-pdf'
    })

    const result = await jsreport.render({
      template: {
        content: `{{pdfCreatePagesGroup foo="1"/}}`,
        engine: 'jsrender',
        name: 'content',
        recipe: 'chrome-pdf',
        pdfOperations: [{ type: 'merge', renderForEveryPage: true, templateShortid: 'header' }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)
    parsedPdf.pages[0].text.includes('1').should.be.ok()
  })

  it('merge with renderForEveryPage should be able to use multiple pdfAddPageItem helper', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: '{{#with (lookup $pdf.pages $pdf.pageIndex)}}{{items.[0]}}{{items.[1]}}{{/with}}',
      shortid: 'header',
      name: 'header',
      engine: 'handlebars',
      recipe: 'chrome-pdf'
    })

    const result = await jsreport.render({
      template: {
        content: `{{{pdfAddPageItem "a"}}}{{{pdfAddPageItem "b"}}}`,
        name: 'content',
        engine: 'handlebars',
        recipe: 'chrome-pdf',
        pdfOperations: [{ type: 'merge', renderForEveryPage: true, templateShortid: 'header' }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)

    parsedPdf.pages[0].items.should.have.length(2)
    parsedPdf.pages[0].items[0].should.be.eql('a')
    parsedPdf.pages[0].items[1].should.be.eql('b')
    parsedPdf.pages[0].text.includes('ab').should.be.true()
  })

  it('merge should work for multiple operations', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: 'header',
      name: 'header',
      shortid: 'header',
      engine: 'handlebars',
      recipe: 'chrome-pdf'
    })

    await jsreport.documentStore.collection('templates').insert({
      content: 'footer',
      name: 'footer',
      shortid: 'footer',
      engine: 'handlebars',
      recipe: 'chrome-pdf'
    })

    const result = await jsreport.render({
      template: {
        content: `Foo`,
        name: 'content',
        engine: 'none',
        recipe: 'chrome-pdf',
        pdfOperations: [{ type: 'merge', templateShortid: 'header' }, { type: 'merge', templateShortid: 'footer' }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)
    parsedPdf.pages[0].text.includes('header').should.be.ok()
    parsedPdf.pages[0].text.includes('footer').should.be.ok()
  })

  it('merge with renderForEveryPage disabled should add static content', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: 'header',
      name: 'header',
      shortid: 'header',
      engine: 'handlebars',
      recipe: 'chrome-pdf'
    })

    const result = await jsreport.render({
      template: {
        content: `Foo`,
        name: 'content',
        engine: 'none',
        recipe: 'chrome-pdf',
        pdfOperations: [{ type: 'merge', renderForEveryPage: false, templateShortid: 'header' }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)
    parsedPdf.pages[0].text.includes('header').should.be.ok()
    parsedPdf.pages[0].text.includes('Foo').should.be.ok()
  })

  it('merge with inline template definition', async () => {
    const result = await jsreport.render({
      template: {
        content: 'foo',
        name: 'content',
        engine: 'none',
        recipe: 'chrome-pdf',
        pdfOperations: [{ type: 'merge', template: { content: 'header', engine: 'none', 'recipe': 'chrome-pdf' } }],
        chrome: {
          marginTop: '3cm'
        }
      }
    })

    const parsedPdf = await parsePdf(result.content, true)

    parsedPdf.pages[0].text.includes('foo').should.be.ok()
    parsedPdf.pages[0].text.includes('header').should.be.ok()
  })

  it('append operation be able to append pages from another template', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: 'anotherpage',
      shortid: 'anotherPage',
      name: 'anotherPage',
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
        name: 'foo',
        recipe: 'chrome-pdf',
        pdfOperations: [{ type: 'append', templateShortid: 'anotherPage' }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)
    parsedPdf.pages[0].text.includes('foo').should.be.ok()
    parsedPdf.pages[1].text.includes('anotherpage').should.be.ok()
  })

  it('append with inline template definition', async () => {
    const result = await jsreport.render({
      template: {
        content: `foo`,
        engine: 'none',
        name: 'foo',
        recipe: 'chrome-pdf',
        pdfOperations: [{ type: 'append', template: { content: 'bar', engine: 'none', recipe: 'chrome-pdf' } }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)
    parsedPdf.pages[0].text.includes('foo').should.be.ok()
    parsedPdf.pages[1].text.includes('bar').should.be.ok()
  })

  it('prepend operation be able to prepend pages from another template', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: 'anotherpage',
      shortid: 'anotherPage',
      name: 'anotherPage',
      engine: 'handlebars',
      recipe: 'chrome-pdf',
      chrome: {
        landscape: true
      }
    })

    const result = await jsreport.render({
      template: {
        content: `foo`,
        name: 'foo',
        engine: 'none',
        recipe: 'chrome-pdf',
        pdfOperations: [{ type: 'prepend', templateShortid: 'anotherPage' }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)
    parsedPdf.pages[0].text.includes('anotherpage').should.be.ok()
    parsedPdf.pages[1].text.includes('foo').should.be.ok()
  })

  it('prepend with inline template definition', async () => {
    const result = await jsreport.render({
      template: {
        content: `foo`,
        name: 'foo',
        engine: 'none',
        recipe: 'chrome-pdf',
        pdfOperations: [{ type: 'prepend', template: { content: 'bar', engine: 'none', recipe: 'chrome-pdf', chrome: { landscape: true } } }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)
    parsedPdf.pages[0].text.includes('bar').should.be.ok()
    parsedPdf.pages[1].text.includes('foo').should.be.ok()
  })

  it('merge should work for very long reports', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: '<div style"height: 2cm">header</div>',
      shortid: 'header',
      name: 'header',
      engine: 'none',
      recipe: 'chrome-pdf'
    })

    let content = 'very long contentvery long content</br>'
    for (let i = 0; i < 5000; i++) {
      content += 'very long contentvery long content</br>'
    }

    const result = await jsreport.render({
      template: {
        content: content,
        name: 'content',
        engine: 'none',
        recipe: 'chrome-pdf',
        pdfOperations: [{ type: 'merge', templateShortid: 'header' }],
        chrome: {
          marginTop: '3cm'
        }
      }
    })

    const parsedPdf = await parsePdf(result.content, true)
    parsedPdf.pages[0].text.includes('header').should.be.ok()
  })

  it('operations should be skipped when rendering template with non pdf', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: '<div style"height: 2cm">header</div>',
      shortid: 'header',
      name: 'header',
      engine: 'none',
      chrome: {
        width: '8cm',
        height: '8cm'
      },
      recipe: 'chrome-pdf'
    })

    const result = await jsreport.render({
      template: {
        content: 'foo',
        name: 'content',
        engine: 'none',
        recipe: 'html',
        pdfOperations: [{ type: 'merge', templateShortid: 'header' }]
      }
    })

    result.content.toString().should.be.eql('foo')
  })

  it('should keep order of logs', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: '<div style"height: 2cm">header</div>',
      shortid: 'header',
      name: 'header',
      engine: 'none',
      chrome: {
        width: '8cm',
        height: '8cm'
      },
      recipe: 'chrome-pdf'
    })

    const result = await jsreport.render({
      template: {
        content: 'foo',
        name: 'content',
        engine: 'none',
        recipe: 'chrome-pdf',
        pdfOperations: [{ type: 'merge', templateShortid: 'header' }],
        chrome: {
          marginTop: '3cm'
        }
      }
    })

    const logs = result.meta.logs.map(m => m.message)
    const startingLogIndex = logs.indexOf('pdf-utils is starting pdf processing')

    startingLogIndex.should.be.not.eql(-1)

    const nextLog = logs[startingLogIndex + 1]

    nextLog.should.be.eql('Detected 1 pdf operation(s) to process')
  })

  it('merge with renderForEveryPage should be able to use groups on previously appended report', async () => {
    await jsreport.documentStore.collection('templates').insert({
      content: '{{#with (lookup $pdf.pages $pdf.pageIndex)}}{{group}}{{/with}}',
      shortid: 'header',
      name: 'header',
      engine: 'handlebars',
      recipe: 'chrome-pdf'
    })

    await jsreport.documentStore.collection('templates').insert({
      content: `{{{pdfCreatePagesGroup "Appended"}}}`,
      shortid: 'append',
      name: 'append',
      engine: 'handlebars',
      recipe: 'chrome-pdf'
    })

    const result = await jsreport.render({
      template: {
        content: `{{{pdfCreatePagesGroup "Main"}}}`,
        engine: 'handlebars',
        recipe: 'chrome-pdf',
        pdfOperations: [ { type: 'append', templateShortid: 'append' },
          { type: 'merge', renderForEveryPage: true, templateShortid: 'header' }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)

    parsedPdf.pages[0].group.should.be.eql('Main')
    parsedPdf.pages[0].text.includes('Main').should.be.ok()
    parsedPdf.pages[1].group.should.be.eql('Appended')
    parsedPdf.pages[1].text.includes('Appended').should.be.ok()
  })

  it('should be able to prepend none jsreport produced pdf', async () => {
    jsreport.afterRenderListeners.insert(0, 'test', (req, res) => {
      if (req.template.content === 'replace') {
        res.content = fs.readFileSync(path.join(__dirname, 'pdf-sample.pdf'))
      }
    })

    const result = await jsreport.render({
      template: {
        content: 'main',
        engine: 'none',
        recipe: 'chrome-pdf',
        pdfOperations: [{
          type: 'prepend',
          template: {
            content: 'replace',
            engine: 'none',
            recipe: 'chrome-pdf'
          }
        }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)
    parsedPdf.pages.should.have.length(2)
  })

  it('should be able to merge none jsreport produced pdf', async () => {
    jsreport.afterRenderListeners.insert(0, 'test', (req, res) => {
      if (req.template.content === 'replace') {
        res.content = fs.readFileSync(path.join(__dirname, 'pdf-sample.pdf'))
      }
    })

    const result = await jsreport.render({
      template: {
        content: 'main',
        engine: 'none',
        recipe: 'chrome-pdf',
        pdfOperations: [{
          type: 'merge',
          template: {
            content: 'replace',
            engine: 'none',
            recipe: 'chrome-pdf'
          }
        }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)
    parsedPdf.pages.should.have.length(1)
  })

  it('should be able to merge none jsreport produced pdf with multiple xobjs', async () => {
    jsreport.afterRenderListeners.insert(0, 'test', (req, res) => {
      if (req.template.content === 'replace') {
        res.content = fs.readFileSync(path.join(__dirname, 'multiple-embedded-xobj.pdf'))
      }
    })

    const result = await jsreport.render({
      template: {
        content: 'main',
        engine: 'none',
        recipe: 'chrome-pdf',
        pdfOperations: [{
          type: 'merge',
          template: {
            content: 'replace',
            engine: 'none',
            recipe: 'chrome-pdf'
          }
        }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)
    parsedPdf.pages.should.have.length(1)
  })

  it('merge should merge whole documents when mergeWholeDocument', async () => {
    const result = await jsreport.render({
      template: {
        content: `main1<div style='page-break-before: always;'></div>main2`,
        name: 'content',
        engine: 'none',
        recipe: 'chrome-pdf',
        pdfOperations: [{
          type: 'merge',
          mergeWholeDocument: true,
          template: {
            content: `{{#each $pdf.pages}}
            <div>header</div>
            <div style='page-break-before: always;'></div>
          {{/each}}`,
            engine: 'handlebars',
            recipe: 'chrome-pdf'
          }
        }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)
    parsedPdf.pages.should.have.length(2)
    parsedPdf.pages[0].text.includes('header').should.be.ok()
    parsedPdf.pages[1].text.includes('header').should.be.ok()
  })

  it('should be able to merge watermark into pdf with native header produced by phantomjs', async () => {
    const result = await jsreport.render({
      template: {
        content: `main`,
        name: 'content',
        engine: 'none',
        recipe: 'phantom-pdf',
        phantom: {
          header: 'header'
        },
        pdfOperations: [{
          type: 'merge',
          mergeWholeDocument: true,
          template: {
            content: `watermark`,
            engine: 'handlebars',
            recipe: 'phantom-pdf'
          }
        }]
      }
    })

    const parsedPdf = await parsePdf(result.content, true)
    parsedPdf.pages.should.have.length(1)
    parsedPdf.pages[0].text.includes('header').should.be.ok()
    parsedPdf.pages[0].text.includes('watermark').should.be.ok()
  })
})

describe('pdf utils with http-server templating strategy', () => {
  let jsreport
  beforeEach(async () => (jsreport = await initialize('http-server')))
  afterEach(() => jsreport.close())

  it('should not fail when main and appended template has printBackground=true', async () => {
    const req = {
      template: {
        content: ' ',
        recipe: 'chrome-pdf',
        engine: 'handlebars',
        chrome: {
          printBackground: true
        },
        pdfOperations: [{
          type: 'append',
          template: {
            content: 'append',
            engine: 'handlebars',
            recipe: 'chrome-pdf',
            chrome: {
              printBackground: true
            }
          }
        }]
      }
    }

    const result = await jsreport.render(req)

    const parsedPdf = await parsePdf(result.content, true)
    parsedPdf.pages.should.have.length(2)
  })
})
