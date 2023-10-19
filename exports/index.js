// @ts-check

/**
 * @typedef {object} RegistryOptions
 * @property {HTMLElement} [RegistryOptions.rootElement=document.documentElement]
 * @property {string} [RegistryOptions.controllerAttribute="oil-controller"]
 * @property {string} [RegistryOptions.targetAttribute="oil-target"]
 */

/**
 *
 */
export class Controller {
  /**
   * @type {string[]}
   */
  static targets = []

  /**
   * @param {object} options
   * @param {HTMLElement} options.element
   * @param {Application} options.application
   * @param {string} options.controllerName
   */
  constructor ({ element, application, controllerName }) {
    ;/** @type {typeof Controller} */ (this.constructor).targets.forEach((targetName) => {
      // Arrays need to be created every time. Otherwise they share an array across all instances.
      // @ts-expect-error
      this[`${targetName}Targets`] = [];

      // @ts-expect-error
      if (!this.constructor.__finalized__) {
        // @ts-expect-error
        this.constructor.__finalized__ = true;

        Object.defineProperties(this.constructor.prototype, {
          [`has${capitalize(targetName)}Target`]: {
            value: false,
            writable: true
          },
          [`${targetName}Target`]: {
            value: null,
            writable: true
          },
        })
      }
    })

    /**
     * @type {Element}
     */
    this.element = element

    /**
     * @type {Application}
     */
    this.application = application

    /**
     * @type {string}
     */
    this.controllerName = controllerName

    /**
     * @type {boolean}
     */
    this.isConnected = false
  }

  connectedCallback () {}
  disconnectedCallback () {}
}

export class Application {
  /**
   * Starts the registry and listens.
   * @param {RegistryOptions} options
   */
  static start (options = {}) {
    return new this(options).start()
  }

  /**
   * @param {RegistryOptions} options
   */
  constructor(options = {}){
    if (!options.rootElement) {
      options.rootElement = document.documentElement
    }

    if(!(options.rootElement instanceof HTMLElement)) {
      throw new Error(`The rootElement must an HTMLElement. Was given ${options.rootElement}`);
    }

    /**
     * The root element which is where query selectors will be scoped from.
     * @type {HTMLElement}
     */
    this.rootElement = options.rootElement;

    /**
     * @type {Map<string, typeof Controller>}
     */
    this._controllerMap = new Map();

    /**
     * @type {WeakMap<HTMLElement, Map<string, Controller>>}
     */
    this._elementMap = new WeakMap();


    /**
     * @type {Map<Controller, Set<HTMLElement>>}
     */
    this._controllerTargetMap = new Map()

    /**
     * If the registry has started listening for new elements.
     * @type {boolean}
     */
    this.started = false

    /**
     * The attribute to use for finding a controller. Defaults to "oil-controller".
     * @type {string}
     */
    this.controllerAttribute = options.controllerAttribute || "oil-controller"

    /**
     * The attribute to use for finding targets. Defaults to "oil-target".
     * @type {string}
     */
    this.targetAttribute = options.targetAttribute || "oil-target"
  }

  /**
   * Starts the registry and listens.
   * @param {RegistryOptions} options
   */
  start (options = {}) {
    this.rootElement = options.rootElement || document.documentElement

    if (options.controllerAttribute) {
      this.controllerAttribute = options.controllerAttribute
    }

    if (options.targetAttribute) {
      this.targetAttribute = options.targetAttribute
    }

    if (!this.started) {
      this._observe();
      this.started = true
    }
    return this
  }

  /**
   * Takes records, and then disconnects the observer.
   */
  stop () {
    if (this.started) {
      this.started = false
      const mutations = this.observer?.takeRecords()

      if (mutations) {
        this.handleMutations(mutations)
      }

      this.observer?.disconnect()
    }
    return this
  }

  /**
   * Registers a new controller to listen for.
   * @param {string} controllerName
   * @param {typeof Controller} Constructor
   */
  register(controllerName, Constructor) {
    this._controllerMap.set(controllerName, Constructor);
    this._upgradeControllers(controllerName);
  }

  /**
   * Finds a map of controllers based on the element and controllerName.
   * @param {HTMLElement} element
   * @param {string} controllerName
   * @return {null | undefined | Controller}
   */
  getController(element, controllerName) {
    let map = this._elementMap.get(element);
    if(!map) return;
    return map.get(controllerName);
  }

  /**
   * @param {string} controllerName
   * @return {undefined | null | typeof Controller}
   */
  _getConstructor (controllerName) {
    return this._controllerMap.get(controllerName);
  }

  _observe () {
    let root = this.rootElement;

    if (!this.observer) {
      this.observer = new MutationObserver(this.handleMutations);
    }

    this.observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        this.controllerAttribute,
        this.targetAttribute,
      ]
      // attributeOldValue: true
    });
  }

  /**
   * @param {MutationRecord[]} mutations
   */
  handleMutations = (mutations) => {
    let registry = this;

    for (const m of mutations) {
      if(m.type === 'attributes') {
        if (m.attributeName == null) continue;

        if (m.attributeName === this.controllerAttribute) {
          this._handleControllerAttributeMutation(m)
          continue
        } else if (m.attributeName === this.targetAttribute) {
          this._handleTargetAttributeMutation(m)
        }
      }
      // childList
      else {
        m.removedNodes.forEach((node) => {
          this._downgradeAll(/** @type {HTMLElement} */ (node))
        })
        m.addedNodes.forEach((node) => {
          this._upgradeAllElements(/** @type {HTMLElement} */ (node))
        })
      }
    }
  }

  /**
   * @param {string} controllerName
   * @param {HTMLElement} [rootElement]
   */
  _upgradeControllers(controllerName, rootElement) {
    const root = rootElement || this.rootElement;

    let query = `[${this.controllerAttribute}~='${controllerName}']`

    let matches = root.querySelectorAll(query);

    matches.forEach((match) => {
      this._createControllerInstance(controllerName, /** @type {HTMLElement} */ (match));
    })
  }

  /**
   * @param {HTMLElement} element
   */
  _upgradeAllElements = (element) => {
    if(element.nodeType !== 1) return;

    this._upgradeElement(element)

    element.querySelectorAll("*").forEach((el) => {
      this._upgradeElement(/** @type {HTMLElement} */ (el))
    })
  }

  /**
   * @param {HTMLElement} element
   */
  _upgradeElement(element) {
    if(element.nodeType !== 1) return;

    const controllers = element.getAttribute(this.controllerAttribute)

    if (controllers) {
      this._attributeToControllers(controllers).forEach((controllerName) => {
        this._createControllerInstance(controllerName, element);
      })
    }
  }

  /**
   * @param {HTMLElement} element
   */
  _downgradeAll = (element) => {
    if(element.nodeType !== 1) return;

    this._downgrade(element)

    element.querySelectorAll("*").forEach((el) => {
      this._downgrade(/** @type {HTMLElement} */ (el))
    })
  }

  /**
   * @param {HTMLElement} element
   * @param {string} [controllerName] - if a controllerName is given, only downgrade that specific controller.
   */
  _downgrade = (element, controllerName) => {
    if(element.nodeType !== 1) return;

    let map = this._elementMap.get(element);

    if(!map) return;

    if (!controllerName) {
      // Downgrade every controller
      map.forEach((inst) => {
        if (inst.disconnectedCallback) {
          inst.disconnectedCallback();
          inst.isConnected = false
        }
      });
    } else {
      const inst = map.get(controllerName)

      if (!inst) return

      if (inst.disconnectedCallback) {
        inst.disconnectedCallback()
        inst.isConnected = false
      }
    }
  }

  /**
   * @param {string} controllerName
   * @param {HTMLElement} el
   */
  _createControllerInstance(controllerName, el) {
    let map = this._elementMap.get(el);

    if(!map) {
      map = new Map();
      this._elementMap.set(el, map);
    }

    let inst = this.getController(el, controllerName);
    let hasController = el.getAttribute(this.controllerAttribute)?.includes(controllerName);

    if(!inst) {
      let Constructor = this._getConstructor(controllerName);

      if (!Constructor) return

      inst = new Constructor({ element: el, application: this, controllerName });
      map.set(controllerName, inst);
      inst.element = el
      inst.application = this
      inst.controllerName = controllerName
    }

    if (!inst.isConnected) {
      inst.isConnected = true

      if(inst.connectedCallback) {
        inst.connectedCallback();
      }

      setTimeout(() => {
        // Find children targets and upgrade them
        if (el) {
          this._upgradeAllTargets(el)
        }
      })
    }

    // Attribute was removed
    if(!hasController) {
      if(inst.disconnectedCallback) {
        inst.disconnectedCallback();
      }

      inst.isConnected = false
    }
  }

  /**
   * Takes an attribute and turns it into an array of controller names.
   * @param {string} str
   * @return {Array<string>}
   */
  _attributeToControllers (str) {
    return str?.split(/\s+/) || []
  }

  /**
   * @param {MutationRecord} m
   */
  _handleControllerAttributeMutation (m) {
    if (!m.attributeName) return

    const target = /** @type {HTMLElement} */ (m.target)
    const attribute = target.getAttribute(m.attributeName)

    // If we remove the attribute, we can just remove all controllers.
    if (!attribute) {
      this._downgrade(/** @type {HTMLElement} */ (target))
      return
    }

    let controllersToConnect = this._attributeToControllers(attribute)

    if (m.oldValue && attribute !== m.oldValue) {
      // We need to do some diff logic here to figure out what controllers to disconnect
      const oldControllers = this._attributeToControllers(m.oldValue)

      // We could make turn these into Set and compare that way, but for such small arrays, feels wasteful.
      // Disconnect any controllers not found in the new attributes.
      oldControllers.forEach((controllerName) => {
        if (controllersToConnect.includes(controllerName)) return

        this._downgrade(target, controllerName)
      })
    }


    const registry = this

    controllersToConnect.forEach((controllerName) => {
      registry._createControllerInstance(controllerName, target);
    })
  }

  /**
   * @param {MutationRecord} m
   */
  _handleTargetAttributeMutation (m) {
    if (!m.attributeName) return
  }

  /**
   * @param {HTMLElement} el
   */
  _upgradeAllTargets (el) {
    this._upgradeTarget(el);

    /** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll(`[${this.targetAttribute}]`)).forEach((child) => {
      this._upgradeTarget(child)
    })
  }

  /**
   * For a given element, go through all of its children and find its targets and connect them with the proper parent.
   * @param {HTMLElement} el
   */
  _upgradeTarget (el) {
    const val = el?.getAttribute(this.targetAttribute)

    if (!val) return

    const parsedControllers = this._parseTargetAttribute(val)

    // No controllers, nothing to upgrade.
    if (parsedControllers.length <= 0) return

    // We check the parentElement because if we do `.closest`, we could return the same element, but we only want to look "up" the DOM.
    const parentEl = el.parentElement
    if (!parentEl) return

    parsedControllers.forEach(([controllerName, targetName]) => {
      if (!controllerName) return
      if (!targetName) return

      const closestControllerEl = parentEl.closest(`[${this.controllerAttribute}~='${controllerName}']`)

      if (!closestControllerEl) return

      // We have a controller, lets find it in our map and fire a `xTargetConnected` and add it to its targets array.
      const controller = this.getController(/** @type {HTMLElement} */ (closestControllerEl), controllerName)

      if (!controller) return

      // @ts-expect-error
      if (!controller[`has${capitalize(targetName)}Target`]) {
        // @ts-expect-error
        controller[`has${capitalize(targetName)}Target`] = true
      }

      // @ts-expect-error
      if (controller[`${targetName}Target`] == null) {
        // @ts-expect-error
        controller[`${targetName}Target`] = el
      }

      // @ts-expect-error
      if (!controller[`${targetName}Targets`].includes(el)) {
        // @ts-expect-error
        controller[`${targetName}Targets`].push(el)

        // @ts-expect-error
        if (typeof controller[`${targetName}TargetConnected`] === "function") {
          // @ts-expect-error
          controller[`${targetName}TargetConnected`](el)
        }
      }
    })
  }

  /**
   * Returns the controllers for the given "target" attribute.
   * The [['controllerName', 'targetName'], ['controllerName', 'targetName']] is the array of tuples returned.
   * @param {string} str - The attribute value to read
   * @return {Array<[string, null | undefined | string]>}
   */
  _parseTargetAttribute (str) {
    if (!str) {
      return []
    }

    // Split at white space, get to the bare strings, then split at the "."
    return str.split(/\s+/).map((str) => /** @type {[string, null | undefined | string]} */ (str.split(/\./)))
  }
}

/**
 * @param {string} str
 * @return {string}
 */
function capitalize (str) {
  return str[0].toUpperCase() + str.slice(1, str.length)
}
