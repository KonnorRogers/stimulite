import { aTimeout, fixture, html } from "@open-wc/testing-helpers"
import { assert } from "@esm-bundle/chai"
import { Application } from "oil-rig"
import Sinon from "sinon"

test("It should record when a target connects", async () => {
  const application = Application.start()

  const itemTargetConnectedSpy = Sinon.spy()
  const itemTargetDisconnectedSpy = Sinon.spy()

  application.register("example", class Example {
    static targets = ["item"]

    itemTargetConnected () {
      itemTargetConnectedSpy()
    }

    itemTargetDisconnected () {
      itemTargetDisconnectedSpy()
    }
  })

  const el = await fixture(html`
    <div data-oil-controller="example">
      <div data-oil-target="example.item"></div>
      <div data-oil-target="example.item"></div>
      <div data-oil-target="example.item"></div>
    </div>
  `)

  const controller = application.getController(el, "example")

  assert.equal(controller.hasChildTargets, true)
  assert.equal(controller.childTargets, 3)
  assert.equal(controller.childTarget, el.querySelector("[data-oil-target]"))

  el.querySelectorAll("[data-oil-target~='example.item']").forEach((target, index) => {
    assert.equal(target, controller.itemTargets[index])
  })
})
