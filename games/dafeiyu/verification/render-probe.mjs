/** Serialized into a real WebGPU page; count scene work only after its command buffer is submitted. */
export function installSceneRenderProbe() {
  const scene = 'Dafeiyu 2D puzzle';
  const owners = new WeakMap(), staged = new WeakMap(), commands = new WeakMap(), direct = new WeakSet();
  const stats = { sceneSubmissions: 0, bundles: 0, draws: 0 };
  let completion = Promise.resolve();
  const hooks = [];
  const wrap = (prototype, name, create) => {
    const original = prototype[name];
    prototype[name] = create(original);
    hooks.push(() => { prototype[name] = original; });
  };
  const record = (pass, count) => {
    const owner = owners.get(pass);
    if (owner) staged.set(owner, (staged.get(owner) ?? 0) + count);
  };
  wrap(GPUCommandEncoder.prototype, 'beginRenderPass', original => function (...args) {
    const pass = original.apply(this, args);
    owners.set(pass, this);
    return pass;
  });
  wrap(GPURenderPassEncoder.prototype, 'setPipeline', original => function (pipeline) {
    if (pipeline.label.startsWith(scene + '.pipeline.')) direct.add(this);
    else direct.delete(this);
    return original.call(this, pipeline);
  });
  wrap(GPURenderPassEncoder.prototype, 'draw', original => function (vertices, instances = 1, ...args) {
    const result = original.call(this, vertices, instances, ...args);
    if (direct.has(this) && vertices > 0 && instances > 0) { stats.draws++; record(this, 1); }
    return result;
  });
  wrap(GPURenderPassEncoder.prototype, 'executeBundles', original => function (input) {
    const bundles = Array.from(input);
    const result = original.call(this, bundles);
    const count = bundles.filter(bundle => bundle.label === scene).length;
    stats.bundles += count;
    record(this, count);
    return result;
  });
  wrap(GPUCommandEncoder.prototype, 'finish', original => function (...args) {
    const buffer = original.apply(this, args);
    commands.set(buffer, staged.get(this) ?? 0);
    return buffer;
  });
  wrap(GPUQueue.prototype, 'submit', original => function (input) {
    const buffers = Array.from(input);
    const result = original.call(this, buffers);
    if (buffers.some(buffer => commands.get(buffer) > 0)) {
      stats.sceneSubmissions++;
      completion = this.onSubmittedWorkDone();
      void completion.catch(() => {});
    }
    return result;
  });
  return { stats: () => ({ ...stats }), completed: () => completion,
    dispose: () => { for (const restore of hooks.reverse()) restore(); } };
}
