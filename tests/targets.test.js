import { aTimeout, fixture, html } from "@open-wc/testing-helpers"
import { assert } from "@esm-bundle/chai"
import { Application, Controller } from "oil-rig"
import Sinon from "sinon"

test("It should have target functions in the constructor", () => {
  class Example extends Controller {
    static targets = ["item"]

    constructor(...args) {
      super(...args)

      assert.equal(this.hasItemTarget, false)
      assert.equal(this.itemTarget, null)
      assert.equal(this.itemTargets.length, 0)
    }
  }

  new Example({})
})

test("It should record when a target connects", async () => {
  const application = Application.start()

  const itemTargetConnectedSpy = Sinon.spy()
  const itemTargetDisconnectedSpy = Sinon.spy()

  application.register("example", class Example extends Controller {
    static targets = ["item"]

    itemTargetConnected () {
      itemTargetConnectedSpy()
    }

    itemTargetDisconnected () {
      itemTargetDisconnectedSpy()
    }
  })

  const el = await fixture(html`
    <div oil-controller="example">
      <div oil-target="example.item"></div>
      <div oil-target="example.item"></div>
      <div oil-target="example.item"></div>
    </div>
  `)

  await aTimeout(1)
  const controller = application.getController(el, "example")

  assert.equal(controller.hasItemTarget, true)
  assert.equal(controller.itemTargets.length, 3)
  assert.equal(controller.itemTarget, el.querySelector("[oil-target]"))

  el.querySelectorAll("[oil-target~='example.item']").forEach((target, index) => {
    assert.equal(target, controller.itemTargets[index])
  })
})

test("It should not count nested targets", async () => {
  const application = Application.start()

  const itemTargetConnectedSpy = Sinon.spy()
  const itemTargetDisconnectedSpy = Sinon.spy()

  application.register("example", class Example extends Controller {
    static targets = ["item"]

    itemTargetConnected () {
      itemTargetConnectedSpy()
    }

    itemTargetDisconnected () {
      itemTargetDisconnectedSpy()
    }
  })

  const el = await fixture(html`
    <div oil-controller="example">
      <div oil-target="example.item"></div>
      <div oil-target="example.item"></div>
      <div oil-target="example.item"></div>
      <div id="nested-example" oil-controller="example">
        <div id="nested-1" class="nested" oil-target="example.item"></div>
        <div id="nested-2" class="nested" oil-target="example.item"></div>
      </div>
    </div>
  `)


  const controller = application.getController(el, "example")
  const nestedController = application.getController(el.querySelector("[oil-controller~='example']"), "example")

  assert.equal(controller.hasItemTarget, true)
  assert.equal(controller.itemTargets.length, 3)
  assert.equal(controller.itemTarget, el.querySelector("[oil-target]"))

  nestedController.element.querySelectorAll(".nested[oil-target~='example.item']").forEach((target, index) => {
    assert.equal(target, nestedController.itemTargets[index])
  })

  assert.equal(itemTargetConnectedSpy.callCount, 5)
})

test("It should not count nested targets when using multiple controllers", async () => {
  const application = Application.start()

  const itemTargetConnectedSpy = Sinon.spy()
  const itemTargetDisconnectedSpy = Sinon.spy()

  application.register("example-1", class Example extends Controller {
    static targets = ["item"]

    itemTargetConnected () {
      itemTargetConnectedSpy()
    }

    itemTargetDisconnected () {
      itemTargetDisconnectedSpy()
    }
  })

  application.register("example-2", class Example2 extends Controller {
    static targets = ["item"]

    itemTargetConnected () {
      itemTargetConnectedSpy()
    }

    itemTargetDisconnected () {
      itemTargetDisconnectedSpy()
    }
  })

  const el = await fixture(html`
    <div oil-controller="example-1 example-2">
      <div oil-target="example-1.item"></div>
      <div oil-target="example-1.item example-2.item"></div>
      <div oil-target="example-1.item example-2.item"></div>
      <div id="nested-example" oil-controller="example-1">
        <div id="nested-1" class="nested" oil-target="example-1.item example-2.item"></div>
        <div id="nested-2" class="nested" oil-target="example-1.item example-2.item"></div>
      </div>
    </div>
  `)


  const controller = application.getController(el, "example-1")
  const controller2 = application.getController(el, "example-2")
  const nestedController = application.getController(el.querySelector("[oil-controller~='example-1']"), "example-1")

  assert.equal(controller2.hasItemTarget, true)
  assert.equal(controller2.itemTargets.length, 4)
  assert.equal(controller2.itemTarget, el.querySelectorAll("[oil-target]")[1])

  assert.equal(controller.hasItemTarget, true)
  assert.equal(controller.itemTargets.length, 3)
  assert.equal(controller.itemTarget, el.querySelector("[oil-target]"))

  nestedController.element.querySelectorAll(".nested[oil-target~='example-1.item']").forEach((target, index) => {
    assert.equal(target, nestedController.itemTargets[index])
  })

  // We added 4 extra calls for example-2
  assert.equal(itemTargetConnectedSpy.callCount, 9)

  el.querySelector("#nested-2").remove()

  await aTimeout(1)
  // 1 time for example-1 and example-2
  assert.equal(itemTargetDisconnectedSpy.callCount, 2)

  el.querySelector("[oil-target]").setAttribute("oil-target", "example-2.item")

  await aTimeout(1)
  assert.equal(itemTargetConnectedSpy.callCount, 9)
  assert.equal(itemTargetDisconnectedSpy.callCount, 3)

  el.querySelector("[oil-controller~='example-1']").remove()
  await aTimeout(1)
  assert.equal(itemTargetDisconnectedSpy.callCount, 5)
})
