export function preserveGamePass(descriptor: GPURenderPassDescriptor): GPURenderPassDescriptor {
  for (const attachment of descriptor.colorAttachments) if (attachment?.resolveTarget) attachment.storeOp = 'store';
  return descriptor;
}
