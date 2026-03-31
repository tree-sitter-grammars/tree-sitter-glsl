const EXTENSIONS = require("./extensions");

/**
 * Built-in entry categories stored in each group.
 * @typedef {'types' | 'variables' | 'constants' | 'functions' | 'macros'} BuiltinKey
 *
 * Highlight capture role for a macro alias.
 * @typedef {'variable.builtin' | 'constant.builtin' | 'function.builtin' | 'type.builtin'} MacroRole
 */

/**
 * Built-in names grouped by category.
 * @typedef {object} BuiltinGroup
 * @property {string[]} types Built-in type-like names.
 * @property {string[]} variables Built-in variable names.
 * @property {string[]} constants Built-in constant names.
 * @property {string[]} functions Built-in function names.
 * @property {Record<string, MacroRole>} macros Built-in macro aliases keyed by name with highlight role.
 */

/**
 * Sparse built-in names grouped by category.
 * Empty categories may be omitted and normalize to `[]`.
 * @typedef {object} BuiltinGroupInput
 * @property {string[]} [types] Built-in type-like names.
 * @property {string[]} [variables] Built-in variable names.
 * @property {string[]} [constants] Built-in constant names.
 * @property {string[]} [functions] Built-in function names.
 * @property {Record<string, MacroRole>} [macros] Built-in macro aliases keyed by name with highlight role.
 */

/**
 * Top-level built-in registry split by language/profile scope.
 * @typedef {object} BuiltinRegistry
 * @property {BuiltinGroup} core Core-language built-ins.
 * @property {BuiltinGroup} glsl Desktop GLSL built-ins.
 * @property {BuiltinGroup} vulkan Vulkan GLSL built-ins.
 * @property {{[extension: string]: BuiltinGroup}} extensions Extension-owned built-in additions.
 */

/**
 * Top-level built-in registry input split by language/profile scope.
 * Empty categories may be omitted and normalize to `[]`.
 * @typedef {object} BuiltinRegistryInput
 * @property {BuiltinGroupInput} core Core-language built-ins.
 * @property {BuiltinGroupInput} glsl Desktop GLSL built-ins.
 * @property {BuiltinGroupInput} vulkan Vulkan GLSL built-ins.
 * @property {{[extension: string]: BuiltinGroupInput}} extensions Extension-owned built-in additions.
 */

/**
 * Projects shared extension data into builtin buckets.
 * @param {{
 *   typeNames?: string[],
 *   variableNames?: string[],
 *   constantNames?: string[],
 *   functionNames?: string[],
 *   definedMacros?: Record<string, MacroRole>,
 * }} extension Extension entry to project into builtin categories.
 * @returns {BuiltinGroupInput} Sparse builtin bucket.
 */
function builtinGroupFromExtension(extension) {
  return {
    types: extension.typeNames,
    variables: extension.variableNames,
    constants: extension.constantNames,
    functions: extension.functionNames,
    macros: extension.definedMacros,
  };
}

/**
 * GLSL built-in types, variables, constants, functions and macros.
 *
 * Specification doesn't have a specification, so we can't parse it to generate
 * these automatically without it breaking at some point. So the list must be
 * manually maintained.
 *
 * Large changes are exceedingly rare these days, so in most cases it is trivial
 * to detect when we are simply missing an extension and to add it here and in
 * `extensions.js`.
 *
 * Last sync commit: 89c8174ba2f4ed5a1956857b8d575463c2683362
 * @type {BuiltinRegistryInput}
 */
const BUILTINS = {
  core: {
    types: [
      "gl_DepthRangeParameters",
      "gl_FogParameters",
      "gl_LightModelParameters",
      "gl_LightModelProducts",
      "gl_LightProducts",
      "gl_LightSourceParameters",
      "gl_MaterialParameters",
      "gl_PerFragment",
      "gl_PerVertex",
      "gl_PointParameters",
    ],
    variables: [
      "gl_BackColor",
      "gl_BackLightModelProduct",
      "gl_BackLightProduct",
      "gl_BackMaterial",
      "gl_BackSecondaryColor",
      "gl_BaseInstance",
      "gl_BaseVertex",
      "gl_BoundingBox",
      "gl_ClipDistance",
      "gl_ClipPlane",
      "gl_ClipVertex",
      "gl_Color",
      "gl_CullDistance",
      "gl_DepthRange",
      "gl_DrawID",
      "gl_EyePlaneQ",
      "gl_EyePlaneR",
      "gl_EyePlaneS",
      "gl_EyePlaneT",
      "gl_Fog",
      "gl_FogCoord",
      "gl_FogFragCoord",
      "gl_FragColor",
      "gl_FragCoord",
      "gl_FragData",
      "gl_FragDepth",
      "gl_FrontColor",
      "gl_FrontFacing",
      "gl_FrontLightModelProduct",
      "gl_FrontLightProduct",
      "gl_FrontMaterial",
      "gl_FrontSecondaryColor",
      "gl_GlobalInvocationID",
      "gl_HelperInvocation",
      "gl_InstanceID",
      "gl_InvocationID",
      "gl_Layer",
      "gl_LightModel",
      "gl_LightSource",
      "gl_LocalInvocationID",
      "gl_LocalInvocationIndex",
      "gl_ModelViewMatrix",
      "gl_ModelViewMatrixInverse",
      "gl_ModelViewMatrixInverseTranspose",
      "gl_ModelViewMatrixTranspose",
      "gl_ModelViewProjectionMatrix",
      "gl_ModelViewProjectionMatrixInverse",
      "gl_ModelViewProjectionMatrixInverseTranspose",
      "gl_ModelViewProjectionMatrixTranspose",
      "gl_MultiTexCoord0",
      "gl_MultiTexCoord1",
      "gl_MultiTexCoord2",
      "gl_MultiTexCoord3",
      "gl_MultiTexCoord4",
      "gl_MultiTexCoord5",
      "gl_MultiTexCoord6",
      "gl_MultiTexCoord7",
      "gl_Normal",
      "gl_NormalMatrix",
      "gl_NormalScale",
      "gl_NumSamples",
      "gl_NumWorkGroups",
      "gl_ObjectPlaneQ",
      "gl_ObjectPlaneR",
      "gl_ObjectPlaneS",
      "gl_ObjectPlaneT",
      "gl_PatchVerticesIn",
      "gl_Point",
      "gl_PointCoord",
      "gl_PointSize",
      "gl_Position",
      "gl_PrimitiveID",
      "gl_PrimitiveIDIn",
      "gl_ProjectionMatrix",
      "gl_ProjectionMatrixInverse",
      "gl_ProjectionMatrixInverseTranspose",
      "gl_ProjectionMatrixTranspose",
      "gl_SampleID",
      "gl_SampleMask",
      "gl_SampleMaskIn",
      "gl_SamplePosition",
      "gl_SecondaryColor",
      "gl_TessCoord",
      "gl_TessLevelInner",
      "gl_TessLevelOuter",
      "gl_TexCoord",
      "gl_TextureEnvColor",
      "gl_TextureMatrix",
      "gl_TextureMatrixInverse",
      "gl_TextureMatrixInverseTranspose",
      "gl_TextureMatrixTranspose",
      "gl_Vertex",
      "gl_VertexID",
      "gl_ViewportIndex",
      "gl_WorkGroupID",
      "gl_in",
      "gl_out",
    ],
    constants: [
      "gl_MaxAtomicCounterBindings",
      "gl_MaxAtomicCounterBufferSize",
      "gl_MaxClipDistances",
      "gl_MaxClipPlanes",
      "gl_MaxCombinedAtomicCounterBuffers",
      "gl_MaxCombinedAtomicCounters",
      "gl_MaxCombinedClipAndCullDistances",
      "gl_MaxCombinedImageUniforms",
      "gl_MaxCombinedImageUnitsAndFragmentOutputs",
      "gl_MaxCombinedShaderOutputResources",
      "gl_MaxCombinedTextureImageUnits",
      "gl_MaxComputeAtomicCounterBuffers",
      "gl_MaxComputeAtomicCounters",
      "gl_MaxComputeImageUniforms",
      "gl_MaxComputeTextureImageUnits",
      "gl_MaxComputeUniformComponents",
      "gl_MaxComputeWorkGroupCount",
      "gl_MaxComputeWorkGroupSize",
      "gl_MaxCullDistances",
      "gl_MaxDrawBuffers",
      "gl_MaxFragmentAtomicCounterBuffers",
      "gl_MaxFragmentAtomicCounters",
      "gl_MaxFragmentImageUniforms",
      "gl_MaxFragmentInputComponents",
      "gl_MaxFragmentInputVectors",
      "gl_MaxFragmentUniformComponents",
      "gl_MaxFragmentUniformVectors",
      "gl_MaxGeometryAtomicCounterBuffers",
      "gl_MaxGeometryAtomicCounters",
      "gl_MaxGeometryImageUniforms",
      "gl_MaxGeometryInputComponents",
      "gl_MaxGeometryOutputComponents",
      "gl_MaxGeometryOutputVertices",
      "gl_MaxGeometryTextureImageUnits",
      "gl_MaxGeometryTotalOutputComponents",
      "gl_MaxGeometryUniformComponents",
      "gl_MaxGeometryVaryingComponents",
      "gl_MaxImageSamples",
      "gl_MaxImageUnits",
      "gl_MaxLights",
      "gl_MaxPatchVertices",
      "gl_MaxProgramTexelOffset",
      "gl_MaxSamples",
      "gl_MaxTessControlAtomicCounterBuffers",
      "gl_MaxTessControlAtomicCounters",
      "gl_MaxTessControlImageUniforms",
      "gl_MaxTessControlInputComponents",
      "gl_MaxTessControlOutputComponents",
      "gl_MaxTessControlTextureImageUnits",
      "gl_MaxTessControlTotalOutputComponents",
      "gl_MaxTessControlUniformComponents",
      "gl_MaxTessEvaluationAtomicCounterBuffers",
      "gl_MaxTessEvaluationAtomicCounters",
      "gl_MaxTessEvaluationImageUniforms",
      "gl_MaxTessEvaluationInputComponents",
      "gl_MaxTessEvaluationOutputComponents",
      "gl_MaxTessEvaluationTextureImageUnits",
      "gl_MaxTessEvaluationUniformComponents",
      "gl_MaxTessGenLevel",
      "gl_MaxTessPatchComponents",
      "gl_MaxTextureCoords",
      "gl_MaxTextureImageUnits",
      "gl_MaxTextureUnits",
      "gl_MaxTransformFeedbackBuffers",
      "gl_MaxTransformFeedbackInterleavedComponents",
      "gl_MaxVaryingComponents",
      "gl_MaxVaryingFloats",
      "gl_MaxVaryingVectors",
      "gl_MaxVertexAtomicCounterBuffers",
      "gl_MaxVertexAtomicCounters",
      "gl_MaxVertexAttribs",
      "gl_MaxVertexImageUniforms",
      "gl_MaxVertexOutputComponents",
      "gl_MaxVertexOutputVectors",
      "gl_MaxVertexTextureImageUnits",
      "gl_MaxVertexUniformComponents",
      "gl_MaxVertexUniformVectors",
      "gl_MaxViewports",
      "gl_MinProgramTexelOffset",
      "gl_WorkGroupSize",
    ],
    functions: [
      "abs",
      "acos",
      "acosh",
      "all",
      "allInvocations",
      "allInvocationsEqual",
      "any",
      "anyInvocation",
      "asin",
      "asinh",
      "atan",
      "atanh",
      "atomicAdd",
      "atomicAnd",
      "atomicCompSwap",
      "atomicCounter",
      "atomicCounterAdd",
      "atomicCounterAnd",
      "atomicCounterCompSwap",
      "atomicCounterDecrement",
      "atomicCounterExchange",
      "atomicCounterIncrement",
      "atomicCounterMax",
      "atomicCounterMin",
      "atomicCounterOr",
      "atomicCounterSubtract",
      "atomicCounterXor",
      "atomicExchange",
      "atomicMax",
      "atomicMin",
      "atomicOr",
      "atomicXor",
      "barrier",
      "bitCount",
      "bitfieldExtract",
      "bitfieldInsert",
      "bitfieldReverse",
      "ceil",
      "clamp",
      "ComputeAccessedLod",
      "cos",
      "cosh",
      "cross",
      "degrees",
      "determinant",
      "dFdx",
      "dFdxCoarse",
      "dFdxFine",
      "dFdy",
      "dFdyCoarse",
      "dFdyFine",
      "distance",
      "dot",
      "EmitStreamVertex",
      "EmitVertex",
      "EndPrimitive",
      "EndStreamPrimitive",
      "equal",
      "exp",
      "exp2",
      "faceforward",
      "findLSB",
      "findMSB",
      "floatBitsToInt",
      "floatBitsToUint",
      "floor",
      "fma",
      "fract",
      "frexp",
      "ftransform",
      "fwidth",
      "fwidthCoarse",
      "fwidthFine",
      "greaterThan",
      "greaterThanEqual",
      "groupMemoryBarrier",
      "imageAtomicAdd",
      "imageAtomicAnd",
      "imageAtomicCompSwap",
      "imageAtomicExchange",
      "imageAtomicMax",
      "imageAtomicMin",
      "imageAtomicOr",
      "imageAtomicXor",
      "imageLoad",
      "imageSamples",
      "imageSize",
      "imageStore",
      "imulExtended",
      "intBitsToFloat",
      "interpolateAtCentroid",
      "interpolateAtOffset",
      "interpolateAtSample",
      "inverse",
      "inversesqrt",
      "isinf",
      "isnan",
      "ldexp",
      "length",
      "lessThan",
      "lessThanEqual",
      "log",
      "log2",
      "matrixCompMult",
      "max",
      "memoryBarrier",
      "memoryBarrierAtomicCounter",
      "memoryBarrierBuffer",
      "memoryBarrierImage",
      "memoryBarrierShared",
      "min",
      "mix",
      "mod",
      "modf",
      "noise1",
      "noise2",
      "noise3",
      "noise4",
      "normalize",
      "not",
      "notEqual",
      "outerProduct",
      "packDouble2x32",
      "packHalf2x16",
      "packSnorm2x16",
      "packSnorm4x8",
      "packUnorm2x16",
      "packUnorm4x8",
      "pow",
      "radians",
      "reflect",
      "refract",
      "round",
      "roundEven",
      "shadow1D",
      "shadow1DLod",
      "shadow1DProj",
      "shadow1DProjLod",
      "shadow2D",
      "shadow2DLod",
      "shadow2DProj",
      "shadow2DProjLod",
      "sign",
      "sin",
      "sinh",
      "smoothstep",
      "sqrt",
      "step",
      "tan",
      "tanh",
      "texelFetch",
      "texelFetchOffset",
      "texture",
      "texture1D",
      "texture1DLod",
      "texture1DProj",
      "texture1DProjLod",
      "texture2D",
      "texture2DLod",
      "texture2DProj",
      "texture2DProjLod",
      "texture3D",
      "texture3DLod",
      "texture3DProj",
      "texture3DProjLod",
      "textureCube",
      "textureCubeLod",
      "textureGather",
      "textureGatherOffset",
      "textureGatherOffsets",
      "textureGrad",
      "textureGradOffset",
      "textureLod",
      "textureLodOffset",
      "textureOffset",
      "textureProj",
      "textureProjGrad",
      "textureProjGradOffset",
      "textureProjLod",
      "textureProjLodOffset",
      "textureProjOffset",
      "textureQueryLevels",
      "textureQueryLod",
      "textureSamples",
      "textureSize",
      "transpose",
      "trunc",
      "uaddCarry",
      "uintBitsToFloat",
      "umulExtended",
      "unpackDouble2x32",
      "unpackHalf2x16",
      "unpackSnorm2x16",
      "unpackSnorm4x8",
      "unpackUnorm2x16",
      "unpackUnorm4x8",
      "usubBorrow",
    ],
  },
  glsl: {},
  vulkan: {
    variables: ["gl_InstanceIndex", "gl_VertexIndex"],
    constants: ["gl_MaxInputAttachments"],
    functions: ["subpassLoad"],
  },
  extensions: Object.fromEntries(
    Object.entries(EXTENSIONS).map(([name, extension]) => [
      name,
      builtinGroupFromExtension(extension),
    ])
  ),
};

/**
 * Returns a sorted array of unique strings.
 * @param {string[]} values Strings to sort and deduplicate.
 * @returns {string[]} Sorted unique strings.
 */
function sortedUnique(values) {
  return Array.from(new Set(values)).sort();
}

/**
 * Normalizes a built-in group by deduplicating and sorting each category.
 * @param {BuiltinGroupInput} bucket Built-in group to normalize.
 * @returns {BuiltinGroup} Normalized built-in group.
 */
function normalizeBucket(bucket) {
  return {
    types: sortedUnique(bucket.types || []),
    variables: sortedUnique(bucket.variables || []),
    constants: sortedUnique(bucket.constants || []),
    functions: sortedUnique(bucket.functions || []),
    macros: bucket.macros || {},
  };
}

/**
 * Flattens all registry buckets into a single normalized built-in group.
 * @param {BuiltinRegistry} registry Built-in registry to flatten.
 * @returns {BuiltinGroup} Flattened normalized built-in group.
 */
function flattenBuiltins(registry) {
  /** @type {BuiltinGroup} */
  const all = {
    types: [],
    variables: [],
    constants: [],
    functions: [],
    macros: {},
  };

  for (const bucket of [
    registry.core,
    registry.glsl,
    registry.vulkan,
    ...Object.values(registry.extensions),
  ]) {
    all.types.push(...(bucket.types || []));
    all.variables.push(...(bucket.variables || []));
    all.constants.push(...(bucket.constants || []));
    all.functions.push(...(bucket.functions || []));
    Object.assign(all.macros, bucket.macros || {});
  }

  return normalizeBucket(all);
}

/** @type {[string, BuiltinGroupInput][]} */
const extensionEntries = Object.entries(BUILTINS.extensions).map(
  ([name, bucket]) =>
    /** @type {[string, BuiltinGroupInput]} */ ([name, bucket])
);

/** @type {BuiltinRegistry} */
const builtins = {
  core: normalizeBucket(BUILTINS.core),
  glsl: normalizeBucket(BUILTINS.glsl),
  vulkan: normalizeBucket(BUILTINS.vulkan),
  extensions: Object.fromEntries(
    extensionEntries
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, bucket]) => [name, normalizeBucket(bucket)])
  ),
};

export default {
  ...builtins,
  all: flattenBuiltins(builtins),
};
