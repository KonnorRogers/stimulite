// @ts-check

/**
 * @typedef {object} RegistryOptions
 * @property {HTMLElement} [RegistryOptions.rootElement=document.documentElement]
 * @property {string} [RegistryOptions.controllerAttribute="data-oil-controller"]
 * @property {string} [RegistryOptions.targetAttribute="data-oil-target"]
 */

/**
 *
 */
export class Controller {
  /**
   * @param {object} options
   * @param {HTMLElement} options.element
   * @param {Application} options.application
   * @param {string} options.controllerName
   */
  constructor ({ element, application, controllerName }) {
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
     * @type {WeakMap<HTMLElement, Map<string, Controller>>}
     */
    this._targetMap = new WeakMap()

    /**
     * If the registry has started listening for new elements.
     * @type {boolean}
     */
    this.started = false

    /**
     * The attribute to use for finding a controller. Defaults to "data-oil-controller".
     * @type {string}
     */
    this.controllerAttribute = options.controllerAttribute || "data-oil-controller"

    /**
     * The attribute to use for finding targets. Defaults to "data-oil-target".
     * @type {string}
     */
    this.targetAttribute = options.targetAttribute || "data-oil-target"
  }

  /**
   * Starts the registry and listens.
   * @param {RegistryOptions} options
   */
  start (options = {}) {
    this.rootElement = options.rootElement || document.documentElement
    this.controllerAttribute = options.controllerAttribute || "data-oil-controller"

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

    element.querySelectorAll(":scope *").forEach((el) => {
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

    element.querySelectorAll(":scope *").forEach((el) => {
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

    let inst = map.get(controllerName);
    let hasController = el.getAttribute(this.controllerAttribute)?.includes(controllerName);

    if(!inst) {
      let Constructor = this._getConstructor(controllerName);

      if (!Constructor) return

      inst = new Constructor({ element: el, application: this, controllerName });
      map.set(controllerName, inst);
    }

    if (!inst.isConnected) {
      inst.isConnected = true

      if(inst.connectedCallback) {
        inst.connectedCallback();
      }

      setTimeout(() => {
        // Find children targets and upgrade them
        if (el) {
          this._upgradeTargets()
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
  _upgradeTargets (el) {
    const val = el.getAttribute(this.targetAttribute)

    if (!val) return

    const parentControllers = this._targetAttributeToControllers(val)
  }

  /**
   * Returns the controllers for the given "target" attribute.
   * @param {string} str - The attribute value to read
   * @return {Array<string>}
   * @example
   *   <div data-oil-target="example.child example1.child"></div>
   *   _targetAttributeToControllers(div.getAttribute("data-oil-target"))
   *   // => ["example", "example1"]
   */
  _targetAttributeToControllers (str) {
    if (!str) {
      return []
    }

    // Split at white space, get to the bare strings, then split at the "."
    return str.split(/\s+/).map((str) => str.split(/\./)[0])
  }
}

