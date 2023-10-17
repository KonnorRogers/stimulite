// @ts-check

/**
 * @typedef {object} RegistryOptions
 * @property {HTMLElement} [RegistryOptions.rootElement=document.documentElement]
 * @property {string} [RegistryOptions.controllerAttribute="data-oil-controller"]
 * @property {string} [RegistryOptions.targetAttribute="data-oil-target"]
 */

/**
 * @typedef {Constructable<{
    element: HTMLElement;
    controllerName: string;
    application: Application;
    isConnected: boolean;
    initialize?: () => void;
    connectedCallback?: () => void;
    disconnectedCallback?: () => void;
 }>} Controller
 */

/**
 * @template {{}} [T={}]
 * @typedef {{new (...args: any[]): T}} Constructable
 */

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
     * @type {Map<string, Controller>}
     */
    this._controllerMap = new Map();

    /**
     * @type {WeakMap<HTMLElement, Map<string, InstanceType<Controller>>>}
     */
    this._elementMap = new WeakMap();


    /**
     * @type {WeakMap<HTMLElement, Map<string, InstanceType<Controller>>>}
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
   * @param {Controller} Constructor
   */
  register(controllerName, Constructor) {
    this._controllerMap.set(controllerName, Constructor);
    this._upgradeControllers(controllerName);
  }

  /**
   * Finds a map of controllers based on the element and controllerName.
   * @param {HTMLElement} element
   * @param {string} controllerName
   */
  getController(element, controllerName) {
    var map = this._elementMap.get(element);
    if(!map) return;
    return map.get(controllerName);
  }

  /**
   * @param {string} controllerName
   * @return {undefined | null | Controller}
   */
  _getConstructor(controllerName){
    return this._controllerMap.get(controllerName);
  }

  _observe(){
    var root = this.rootElement;

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
    var registry = this;

    for (const m of mutations) {
      if(m.type === 'attributes') {
        if (m.attributeName == null) continue;

        var attr = registry._getConstructor(m.attributeName);

        if(attr) {
          registry._found(m.attributeName, /** @type {HTMLElement} */ (m.target));
        }
      }
      // childList
      else {
        m.removedNodes.forEach((node) => {
          this._downgradeAll(/** @type {HTMLElement} */ (node))
        })
        m.addedNodes.forEach((node) => this._upgradeAllElements(/** @type {HTMLElement} */ (node)))
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

    var matches = root.querySelectorAll(query);

    matches.forEach((match) => {
      this._found(controllerName, /** @type {HTMLElement} */ (match));
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
      controllers.split(/\s+/).forEach((controllerName) => {
        this._found(controllerName, element);
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
   */
  _downgrade = (element) => {
    if(element.nodeType !== 1) return;

    var map = this._elementMap.get(element);

    if(!map) return;

    map.forEach((inst) => {
      if (inst.disconnectedCallback) {
        inst.disconnectedCallback();
        inst.isConnected = false
      }
    });
  }

  /**
   * @param {string} controllerName
   * @param {HTMLElement} el
   */
  _found(controllerName, el) {
    var map = this._elementMap.get(el);

    if(!map) {
      map = new Map();
      this._elementMap.set(el, map);
    }

    var inst = map.get(controllerName);
    var hasController = el.getAttribute(this.controllerAttribute)?.includes(controllerName);

    if(!inst) {
      var Constructor = this._getConstructor(controllerName);

      if (!Constructor) return

      inst = new Constructor();
      map.set(controllerName, inst);
      inst.element = el;
      inst.controllerName = controllerName
      inst.application = this

      if (inst.initialize) {
        inst.initialize()
      }
    }

    if (!inst.isConnected) {
      inst.isConnected = true

      if(inst.connectedCallback) {
        inst.connectedCallback();
      }
    }


    // Attribute was removed
    if(!hasController) {
      if(inst.disconnectedCallback) {
        inst.disconnectedCallback();
      }

      inst.isConnected = false
    }
  }
}
