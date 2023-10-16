import { aTimeout, fixture, html } from "@open-wc/testing-helpers"
import { assert } from "@esm-bundle/chai"
import { Application } from "oil-rig"

test("It should record when a target connects", async () => {
  const application = Application.start()

  application.register("example", class Example {
    static targets = ["child"]

    childTargetConnected () {
    }

    childTargetDisconnected () {
    }
  })

  const el = await fixture(html`
    <div data-oil-controller="example">
      <div data-oil-target="example.child"></div>
      <div data-oil-target="example.child"></div>
      <div data-oil-target="example.child"></div>
    </div>
  `)

  const controller = application.getController(el, "example")

  assert.equal(controller.hasChildTargets, true)
  assert.equal(controller.childTargets, 3)
  assert.equal(controller.childTarget, el.querySelector("[data-example-target]"))
})
