import { type Class, deepClone } from "@heraclius/js-tools"
import {
  computed,
  inject,
  type InjectionKey,
  onActivated,
  onBeforeMount,
  onBeforeUnmount,
  onDeactivated,
  onErrorCaptured,
  onMounted,
  onRenderTracked,
  onRenderTriggered,
  onServerPrefetch,
  onUnmounted,
  onUpdated,
  provide,
  readonly,
  ref,
  shallowReadonly,
  shallowRef,
  watch,
  watchEffect,
  type WatchOptions
} from "vue"
import { onBeforeRouteLeave, onBeforeRouteUpdate, type RouteLocationNormalized } from "vue-router"
import { type HookType, type WatcherTarget } from "./decorators"
import { VueComponent } from "./vue-component"
import { VueDirective } from "./vue-directive"
import { VueService } from "./vue-service"

export interface ComponentOption {
  provideThis?: string | boolean
}

export interface CustomDecoratorOption {
  decoratedName: string
  onSetup?: (instance: any, target: any, option: CustomDecoratorOption, metadata: VueClassMetadata) => void
  onUnmount?: (instance: any, target: any, option: CustomDecoratorOption, metadata: VueClassMetadata) => void
}

const childInstMapKey: InjectionKey<Record<string, VueComponent>> = Symbol("childInstMap")
export const initMutKey = Symbol("init-mut")

export class VueClassMetadata {
  isComponent = false

  componentOption?: ComponentOption

  isService = false

  isDirective = false

  isRouterGuard = false

  directiveName = ""

  routerGuardMatchTo?: RegExp | ((path: RouteLocationNormalized) => boolean)

  routerGuardMatchFrom?: RegExp | ((path: RouteLocationNormalized) => boolean)

  readonly mutts: { propName: string; shallow?: boolean }[] = []

  readonly readonlys: { propName: string; shallow?: boolean }[] = []

  readonly links: {
    refName?: string
    propName: string
    isDirective?: boolean
    directiveName?: string
  }[] = []

  readonly vueInject: Array<{ propName: string; provideKey: any }> = []

  readonly hooks: { methodName: string; type: HookType }[] = []

  readonly watchers: {
    methodName: string
    source?: WatcherTarget<any> | WatcherTarget<any>[]
    option?: WatchOptions
  }[] = []

  readonly propsWatchers: { methodName: string; option?: WatchOptions }[] = []

  readonly computers: string[] = []

  readonly vueDecorators: Array<CustomDecoratorOption> = []

  handleCustomDecorators(instance: any) {
    for (let customDecorator of this.vueDecorators) {
      customDecorator.onSetup?.(instance, instance[customDecorator.decoratedName], customDecorator, this)
    }
  }

  clone() {
    return deepClone(this) as VueClassMetadata
  }

  handleComponentOption(instance: VueComponent) {
    if (instance.props.inst) {
      const instMap = inject(childInstMapKey)
      if (instMap) instMap[instance.props.inst] = instance
    }
    provide(childInstMapKey, instance.childInstMap)
    if (this.componentOption) {
      const { provideThis } = this.componentOption
      if (provideThis) {
        const key = typeof provideThis === "boolean" ? instance.constructor.name : provideThis
        provide(key, instance)
      }
    }
  }

  handleWatchers(instance: object) {
    for (let metadata of this.watchers) {
      let fn = (instance as any)[metadata.methodName]
      if (typeof fn !== "function") throw new Error("Decorator Watcher can only be used on methods")
      fn = fn.bind(instance)
      if (!metadata.source) watchEffect(fn, metadata.option)
      else {
        if (!(metadata.source instanceof Array)) metadata.source = [metadata.source]
        const source: any = metadata.source.map((item: any) => {
          if (typeof item === "string") {
            const $ = (instance as any)[Symbol.for(item)]
            return $ ?? (() => (instance as any)[item])
          } else return () => item(instance)
        })
        watch(source, fn, metadata.option)
      }
    }
  }

  handlePropsWatchers(instance: VueComponent) {
    for (let data of this.propsWatchers) {
      let fn = (instance as any)[data.methodName]
      if (typeof fn !== "function") throw new Error("Decorator PropsWatcher can only be used on methods")
      fn = fn.bind(instance)
      watch(instance.props, fn, data.option)
    }
  }

  handleHook(instance: VueComponent) {
    for (let hookData of this.hooks) {
      let fn = (instance as any)[hookData.methodName]
      if (typeof fn !== "function") throw new Error("Decorator Hook can only be used for methods")
      fn = fn.bind(instance)
      switch (hookData.type) {
        case "onMounted":
          onMounted(fn)
          break
        case "onUnmounted":
          onUnmounted(fn)
          break
        case "onBeforeMount":
          onBeforeMount(fn)
          break
        case "onBeforeUnmount":
          onBeforeUnmount(fn)
          break
        case "onUpdated":
          onUpdated(fn)
          break
        case "onActivated":
          onActivated(fn)
          break
        case "onDeactivated":
          onDeactivated(fn)
          break
        case "onErrorCaptured":
          onErrorCaptured(fn)
          break
        case "onRenderTracked":
          onRenderTracked(fn)
          break
        case "onRenderTriggered":
          onRenderTriggered(fn)
          break
        case "onServerPrefetch":
          onServerPrefetch(fn)
          break
        case "onBeforeRouteLeave":
          onBeforeRouteLeave(fn)
          break
        case "onBeforeRouteUpdate":
          onBeforeRouteUpdate(fn)
          break
        default:
          throw new Error("Unknown Hook Type " + hookData.type)
      }
    }
  }

  handleVueInject(instance: any) {
    for (let item of this.vueInject) {
      const val = inject(item.provideKey)
      Object.defineProperty(instance, item.propName, {
        configurable: true,
        enumerable: true,
        get: () => val
      })
    }
  }

  handleMut(instance: object) {
    let initMut = (instance as any)[initMutKey]
    if (!initMut) initMut = (instance as any)[initMutKey] = {}
    for (let data of this.mutts) {
      const value = (instance as any)[data.propName]
      initMut[data.propName] = deepClone(value)
      const ref$ = data.shallow ? shallowRef(value) : ref(value)
      ;(instance as any)[Symbol.for(data.propName)] = ref$
      Object.defineProperty(instance, data.propName, {
        configurable: true,
        enumerable: true,
        set(v: any) {
          ref$.value = v
        },
        get(): any {
          return ref$.value
        }
      })
    }
  }

  handleReadonly(instance: object) {
    for (let data of this.readonlys) {
      const value = (instance as any)[data.propName]
      const $ = data.shallow ? shallowReadonly(value) : readonly(value)
      ;(instance as any)[Symbol.for(data.propName)] = $
      Object.defineProperty(instance, data.propName, {
        configurable: true,
        enumerable: true,
        get(): any {
          return $
        }
      })
    }
  }

  handleLink(instance: VueComponent) {
    for (let data of this.links) {
      let refName = data.propName
      let directiveName = ""
      if (data.refName) {
        refName = data.refName
      } else if (data.isDirective) {
        refName = refName.replace(/Directive$/, "")
      }
      if (data.isDirective) {
        directiveName = data.directiveName ?? ""
        if (!directiveName) directiveName = refName
      }
      Object.defineProperty(instance, data.propName, {
        configurable: true,
        enumerable: true,
        get(): any {
          const el = instance.childInstMap[refName] ?? instance.vueInstance.refs?.[refName]
          if (data.isDirective) {
            if (!el) throw new Error("There is no ref named " + refName)
            return VueDirective.getInstance(el, directiveName)
          }
          return el
        }
      })
    }
  }

  handleComputer(instance: object) {
    if (!this.computers.length) return
    const prototypeOf = Object.getPrototypeOf(instance)
    for (let computerName of this.computers) {
      const target = (instance as any)[computerName]
      if (typeof target === "function") {
        const fn = target.bind(instance)
        const computer = computed(fn)
        ;(instance as any)[Symbol.for(computerName)] = computer
        ;(instance as any)[computerName] = () => computer.value
      } else {
        const getter = Object.getOwnPropertyDescriptor(prototypeOf, computerName)?.get
        if (!getter) throw new Error("Computer can only be used on getters or no parameter methods")
        const computer = computed(() => getter.call(instance))
        ;(instance as any)[Symbol.for(computerName)] = computer
        Object.defineProperty(instance, computerName, {
          configurable: true,
          get: () => computer.value
        })
      }
    }
  }
}

const metadataMap = new Map<any, VueClassMetadata>()

export function getAllMetadata(): [Class, VueClassMetadata][] {
  return Array.from(metadataMap.entries())
}

export function getMetadata(clazz: any) {
  const metadata = metadataMap.get(clazz)
  if (!metadata) throw new Error("Unable to find corresponding Metadata instance")
  return metadata
}

const appliedSymbol = Symbol("__appliedMetadata__")

export function applyMetadata(clazz: any, instance: VueService | object) {
  const metadata = getMetadata(clazz)
  if ((instance as any)[appliedSymbol]) return metadata
  ;(instance as any)[appliedSymbol] = true
  metadata.handleMut(instance)
  metadata.handleReadonly(instance)
  metadata.handleVueInject(instance)
  metadata.handleComputer(instance)
  metadata.handleWatchers(instance)
  metadata.handleCustomDecorators(instance)
  if (instance instanceof VueComponent) {
    metadata.handleLink(instance)
    metadata.handleHook(instance)
    metadata.handlePropsWatchers(instance)
    metadata.handleComponentOption(instance)
  }
  if (instance instanceof VueService) {
    instance.setup()
  }
  // 如果instance是Service，则将instance挂在全局上
  if (metadata.isService) (globalThis as any)[instance.constructor.name] = instance
  return metadata
}

export function getOrCreateMetadata(
  clazz: Class | object | any,
  ctx?: ClassDecoratorContext | { kind: string; metadata: Record<string, any> } | string
): VueClassMetadata {
  if (!ctx || typeof ctx === "string") {
    if (typeof clazz === "object") clazz = clazz.constructor as Class
    let metadata = metadataMap.get(clazz)
    if (!metadata) {
      const parentClass = Object.getPrototypeOf(clazz)
      const parentMetadata = metadataMap.get(parentClass)
      if (parentMetadata) metadataMap.set(clazz, (metadata = parentMetadata.clone()))
      else metadataMap.set(clazz, (metadata = new VueClassMetadata()))
    }
    return metadata
  } else {
    let metadata = ctx.metadata.metadata
    if (!metadata) metadata = ctx.metadata.metadata = new VueClassMetadata()
    if (ctx.kind === "class") metadataMap.set(clazz, metadata)
    return metadata
  }
}
