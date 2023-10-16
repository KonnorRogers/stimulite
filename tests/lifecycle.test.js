import { aTimeout, fixture, html } from "@open-wc/testing-helpers"
import { assert } from "@esm-bundle/chai"
import { Application } from "oil-rig"
import Sinon from "sinon"

setup(() => {
  Sinon.restore()
})

test("It should bind to document and listen for new controllers (append nested)", async () => {
  await buildLazyTest(async () => {
    return await fixture(html`
      <div>
        <div data-oil-controller="example"></div>
      </div>
    `)
  })
})

/**
 * Test again, this time with a slightly different fixture.
 */
test("It should bind root level and listen for new controllers (append top-level)", async () => {
  await buildLazyTest(async () => {
    return await fixture(html`
      <div data-oil-controller="example"></div>
    `)
  })
})

test("It should invoke the lifecycle if the controllers already exist in the DOM.", async () => {
  const el = await fixture(html`<div data-oil-controller='example'></div>`)
  await aTimeout(1)

  const application = Application.start()

  const connectSpy = Sinon.spy()
  const initializeSpy = Sinon.spy()
  const disconnectSpy = Sinon.spy()
  const constructorSpy = Sinon.spy()

  application.register("example", class Example {
    constructor () {
      assert.isNotOk(this.element)
      constructorSpy()
    }

    initialize () {
      assert.instanceOf(this.element, HTMLElement)
      initializeSpy()
    }

    connectedCallback () {
      assert.instanceOf(this.element, HTMLElement)
      connectSpy()
    }

    disconnectedCallback () {
      assert.instanceOf(this.element, HTMLElement)
      disconnectSpy()
    }
  })

  Sinon.assert.calledOnce(constructorSpy)

  application.stop()
})

async function buildLazyTest(renderFixture) {
  const application = Application.start()

  const connectSpy = Sinon.spy()
  const initializeSpy = Sinon.spy()
  const disconnectSpy = Sinon.spy()
  const constructorSpy = Sinon.spy()

  application.register("example", class Example {
    constructor () {
      assert.isNotOk(this.element)
      constructorSpy()
    }

    initialize () {
      assert.instanceOf(this.element, HTMLElement)
      initializeSpy()
    }

    connectedCallback () {
      assert.instanceOf(this.element, HTMLElement)
      connectSpy()
    }

    disconnectedCallback () {
      assert.instanceOf(this.element, HTMLElement)
      disconnectSpy()
    }
  })

  Sinon.assert.notCalled(constructorSpy)
  Sinon.assert.notCalled(initializeSpy)
  Sinon.assert.notCalled(connectSpy)
  Sinon.assert.notCalled(disconnectSpy)

  const el = await renderFixture()

  Sinon.assert.calledOnce(constructorSpy)
  Sinon.assert.calledOnce(initializeSpy)
  Sinon.assert.calledOnce(connectSpy)
  Sinon.assert.notCalled(disconnectSpy)

  el.remove()
  await aTimeout(1)
  Sinon.assert.calledOnce(constructorSpy)
  Sinon.assert.calledOnce(initializeSpy)
  Sinon.assert.calledOnce(connectSpy)
  Sinon.assert.calledOnce(disconnectSpy)

  document.body.append(el)
  await aTimeout(1)

  Sinon.assert.calledOnce(constructorSpy)
  Sinon.assert.calledOnce(initializeSpy)
  Sinon.assert.calledTwice(connectSpy)
  Sinon.assert.calledOnce(disconnectSpy)

  el.remove()
  await aTimeout(1)
  Sinon.assert.calledOnce(constructorSpy)
  Sinon.assert.calledOnce(initializeSpy)
  Sinon.assert.calledTwice(connectSpy)
  Sinon.assert.calledTwice(disconnectSpy)

  application.stop()
}
