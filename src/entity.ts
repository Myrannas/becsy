import {ComponentType, initComponent} from './component';
import type {Registry} from './registry';


export type EntityId = number;
export type ReadWriteMasks = {read?: number[], write?: number[]};

export class Entity {
  __id: EntityId;

  constructor(private readonly __registry: Registry) {}

  __reset(id: EntityId): void {
    this.__id = id;
  }

  add(type: ComponentType<any>, values?: any): this {
    // TODO: prevent add when entity has been deleted
    CHECK: {
      this.__checkMask(type, true);
      if (this.__registry.hasShape(this.__id, type)) {
        throw new Error(`Entity already has a ${type.name} component`);
      }
    }
    this.__registry.setShape(this.__id, type);
    STATS: this.__registry.dispatcher.stats.for(type).numEntities += 1;
    initComponent(type, this.__id, values);
    return this;
  }

  addAll(...args: (ComponentType<any> | any)[]): this {
    for (let i = 0; i < args.length; i++) {
      const type = args[i];
      CHECK: {
        if (typeof type !== 'function') {
          throw new Error(`Bad arguments to bulk add: expected component type, got: ${type}`);
        }
      }
      let value = args[i + 1];
      if (typeof value === 'function') value = undefined; else i++;
      this.add(type, value);
    }
    return this;
  }

  remove(type: ComponentType<any>): void {
    CHECK: {
      this.__checkMask(type, false);
      this.__checkHas(type);
    }
    this.__remove(type);
  }

  removeAll(...types: ComponentType<any>[]): void {
    for (const type of types) this.remove(type);
  }

  has(type: ComponentType<any>): boolean {
    CHECK: this.__checkMask(type, false);
    return this.__registry.hasShape(this.__id, type);
  }

  read<C>(type: ComponentType<C>): Readonly<C> {
    CHECK: {
      this.__checkMask(type, false);
      this.__checkHas(type);
    }
    return type.__bind!(this.__id, false);
  }

  write<C>(type: ComponentType<C>): C {
    CHECK: {
      this.__checkMask(type, true);
      this.__checkHas(type);
    }
    if (type.__binding!.trackedWrites) this.__registry.trackWrite(this.__id, type);
    return type.__bind!(this.__id, true);
  }

  delete(): void {
    for (const type of this.__registry.types) {
      if (!this.__registry.hasShape(this.__id, type)) continue;
      CHECK: this.__checkMask(type, true);
      this.__remove(type);
    }
    this.__registry.queueDeletion(this.__id);
    this.__clearInboundRefs();
  }

  private __remove(type: ComponentType<any>): void {
    this.__clearOutboundRefs(type);
    if (type.__delete) this.__registry.queueRemoval(this.__id, type);
    this.__registry.clearShape(this.__id, type);
    STATS: this.__registry.dispatcher.stats.for(type).numEntities -= 1;
  }

  private __clearOutboundRefs(type: ComponentType<any>): void {
    if (type.__binding!.refFields.length) {
      const component = this.write(type);
      for (const field of type.__binding!.refFields) {
        (component as any)[field.name] = null;
      }
    }
  }

  private __clearInboundRefs(): void {
    // TODO: implement
  }

  private __checkMask(type: ComponentType<any>, write: boolean): void {
    const rwMasks = this.__registry.executingSystem?.rwMasks;
    const mask = write ? rwMasks?.write : rwMasks?.read;
    if (mask && !this.__registry.maskHasFlag(mask, type)) {
      throw new Error(
        `System didn't mark component ${type.name} as ${write ? 'writable' : 'readable'}`);
    }
  }

  private __checkHas(type: ComponentType<any>): void {
    if (!this.__registry.hasShape(this.__id, type)) {
      throw new Error(`Entity doesn't have a ${type.name} component`);
    }
  }
}


