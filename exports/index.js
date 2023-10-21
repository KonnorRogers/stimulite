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

  static __finalized__ = false

  /**
   * @param {object} options
   * @param {HTMLElement} options.element
   * @param {Application} options.application
   * @param {string} options.controllerName
   */
  constructor ({ element, application, controllerName }) {
    ;/** @type {typeof Controller} */ (this.constructor).targets.forEach((targetName) => {
      /// 11@ts-expect-error
      // this[`${targetName}Targets`] = []

      const ctor = /** @type {typeof Controller} */ (this.constructor)
      // Make sure target calls are accessible in the constructor.
      if (!ctor.__finalized__) {
        ctor.__finalized__ = true;

        Object.defineProperties(ctor.prototype, {
          [`${targetName}Targets`]: {
            get () {
              /**
               * @type {HTMLElement[]}
               */
              const ary = [];
              /** @type {NodeListOf<HTMLElement>} */ (this.element.querySelectorAll(this.application._targetQuery(this.controllerName, targetName))).forEach((el) => {
                if (el.closest(this.application._controllerQuery(this.controllerName)) !== this.element) {
                  return
                }

                ary.push(el)
              })

              return ary
            }
          },
          [`has${capitalize(targetName)}Target`]: {
            get () {
              return Boolean(this[`${targetName}Target`])
            },
          },
          [`${targetName}Target`]: {
            get () {
              return this[`${targetName}Targets`]?.[0] || null
            },
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
     * A map of all Controller constructors
     * @type {Map<string, typeof Controller>}
     */
    this._controllerConstructorMap = new Map();

    /**
     * A weakmap of all controller instances attach to a particular element
     * @type {WeakMap<HTMLElement, Map<string, Controller>>}
     */
    this._controllerInstanceMap = new WeakMap();

    /**
     * A weakmap to track if a target has connected or not for a particular controller.
     * @type {WeakMap<Controller, WeakMap<Element | HTMLElement, boolean>>}
     */
    this._targetConnectionMap = new WeakMap();

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
    this._controllerConstructorMap.set(controllerName, Constructor);
    this._upgradeControllers(controllerName);
  }

  /**
   * Finds a map of controllers based on the element and controllerName.
   * @param {HTMLElement} element
   * @param {string} controllerName
   * @return {null | undefined | Controller}
   */
  getController(element, controllerName) {
    let map = this._controllerInstanceMap.get(element);
    if(!map) return;
    return map.get(controllerName);
  }

  /**
   * @param {string} controllerName
   * @return {undefined | null | typeof Controller}
   */
  _getConstructor (controllerName) {
    return this._controllerConstructorMap.get(controllerName);
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
          this._downgradeAllElements(/** @type {HTMLElement} */ (node))
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

    let matches = root.querySelectorAll(this._controllerQuery(controllerName));

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
  _downgradeAllElements = (element) => {
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

    let map = this._controllerInstanceMap.get(element);

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
    let controllerInstanceMap = this._controllerInstanceMap.get(el);

    if(!controllerInstanceMap) {
      controllerInstanceMap = new Map();
      this._controllerInstanceMap.set(el, controllerInstanceMap);
    }

    let inst = this.getController(el, controllerName);

    let hasController = el.getAttribute(this.controllerAttribute)?.includes(controllerName);

    if(!inst) {
      let Constructor = this._getConstructor(controllerName);

      if (!Constructor) return

      inst = new Constructor({ element: el, application: this, controllerName });
      controllerInstanceMap.set(controllerName, inst);
    }

    let targetMap = this._targetConnectionMap.get(inst)

    if (!targetMap) {
      targetMap = new WeakMap()
      this._targetConnectionMap.set(inst, targetMap)
    }

    if (!inst.isConnected) {
      inst.isConnected = true

      if(inst.connectedCallback) {
        inst.connectedCallback();
      }

      // Find children targets and upgrade them
      setTimeout(() => {
        if (inst) {
          this._upgradeTargets(inst)
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

    controllersToConnect.forEach((controllerName) => {
      this._createControllerInstance(controllerName, target);
    })
  }

  /**
   * @param {MutationRecord} mutation
   */
  _handleTargetAttributeMutation (mutation) {
    if (!mutation.attributeName) return

    if (mutation.attributeName !== this.targetAttribute) {
      return
    }

    /**
     * @type {HTMLElement}
     */
    // @ts-expect-error
    const target = mutation.target

    const targetAttr = target.getAttribute(this.targetAttribute)

    if (!targetAttr) return

    const controllersToFind = this._parseControllersFromTargetAttribute(targetAttr)

    controllersToFind.forEach((controllerName) => {
      /** Have to check parentElement because closest could return a controller at same level as target. */
      const closestController = target?.parentElement?.closest(this._controllerQuery(controllerName))

      if (!closestController) return

      const controller = this.getController(/** @type {HTMLElement} */ (closestController), controllerName)

      if (!controller) return

      this._upgradeTargets(controller)
    })
  }

  /**
    * Finds all `[oil-target~=<controller>.<target>]`
    * @param {string} controllerName -
    * @param {string} targetName
    * @return {string}
    */
  _targetQuery (controllerName, targetName) {
    // Because we scope, we need to make sure the parent is not the same controller.
    return `[${this.targetAttribute}~='${controllerName}.${targetName}']`
  }

  /**
   * @param {string} controllerName
   * @return {string}
   */
  _controllerQuery(controllerName) {
    return `[${this.controllerAttribute}~='${controllerName}']`
  }

  /**
   * @param {Controller} controller
   */
  _upgradeTargets(controller) {
    /** @type {typeof Controller} */ (controller.constructor).targets.forEach((targetName) => {
      const { element, controllerName } = controller
      const query = this._targetQuery(controllerName, targetName)

      let targetMap = this._targetConnectionMap.get(controller)
      element.querySelectorAll(query).forEach((target) => {
        // This preserves scope.
        if (target.closest(this._controllerQuery(controllerName)) !== element) {
          return
        }

        if (!targetMap) {
          targetMap = new WeakMap()
          this._targetConnectionMap.set(controller, targetMap)
        }

        const isConnected = targetMap.get(target)

        if (isConnected) return

        /** @type {(target: Element) => void} */
        // @ts-expect-error
        const targetConnectedFn = controller[`${targetName}TargetConnected`]

        if (typeof targetConnectedFn === "function") {
          targetMap.set(target, true)
          targetConnectedFn(target)
        }
      })
    })
  }

  /**
   * @param {string} str
   * @return {Array<string>}
   */
  _parseControllersFromTargetAttribute (str) {
    /**
     * @type {Array<string>}
     */
    const ary = []

    str.split(/\s+/).forEach((targetString) => {
      const splitStr = targetString.split(/\./)

      const controllerName = splitStr[0]
      ary.push(controllerName)
    })

    return ary
  }
}

/**
 * @param {string} str
 * @return {string}
 */
function capitalize (str) {
  return str[0].toUpperCase() + str.slice(1, str.length)
}
