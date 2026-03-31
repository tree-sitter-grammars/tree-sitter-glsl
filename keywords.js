// @ts-check

import EXTENSIONS from './extensions.js';

/**
 * Grammar keyword categories stored in each bucket.
 *
 * @typedef {'types' | 'storage' | 'precision' | 'interpolation' | 'attributes'} KeywordCategory
 */

/**
 * Grammar keyword groups split by language/profile scope.
 *
 * @typedef {object} KeywordGroup
 * @property {string[]} core Core-language keywords.
 * @property {string[]} glsl Desktop GLSL keywords.
 * @property {string[]} vulkan Vulkan GLSL keywords.
 * @property {string[]} [extensions] Extension keywords.
 */

/**
 * Grammar keywords grouped by syntactic role.
 *
 * @typedef {object} KeywordBucket
 * @property {string[]} types Type keywords.
 * @property {string[]} storage Storage qualifier keywords.
 * @property {string[]} precision Precision qualifier keywords.
 * @property {string[]} interpolation Interpolation qualifier keywords.
 * @property {string[]} attributes Attribute keywords.
 */

/**
 * Sparse grammar keywords grouped by syntactic role.
 * Empty categories may be omitted and normalize to `[]`.
 *
 * @typedef {object} KeywordBucketInput
 * @property {string[]} [types] Type keywords.
 * @property {string[]} [storage] Storage qualifier keywords.
 * @property {string[]} [precision] Precision qualifier keywords.
 * @property {string[]} [interpolation] Interpolation qualifier keywords.
 * @property {string[]} [attributes] Attribute keywords.
 */

/**
 * Top-level grammar keyword registry split by language/profile scope.
 *
 * @typedef {object} KeywordRegistry
 * @property {KeywordBucket} core Core-language grammar keywords.
 * @property {KeywordBucket} glsl Desktop GLSL grammar keywords.
 * @property {KeywordBucket} vulkan Vulkan GLSL grammar keywords.
 * @property {{[extension: string]: KeywordBucket}} extensions Extension-owned grammar additions.
 */

/**
 * Top-level grammar keyword registry input split by language/profile scope.
 * Empty categories may be omitted and normalize to `[]`.
 *
 * @typedef {object} KeywordRegistryInput
 * @property {KeywordBucketInput} core Core-language grammar keywords.
 * @property {KeywordBucketInput} glsl Desktop GLSL grammar keywords.
 * @property {KeywordBucketInput} vulkan Vulkan GLSL grammar keywords.
 * @property {{[extension: string]: KeywordBucketInput}} extensions Extension-owned grammar additions.
 */

/**
 * Projects shared extension data into keyword buckets.
 *
 * @param {{
 *   typeKeywords?: string[],
 *   storageQualifiers?: string[],
 *   precisionQualifiers?: string[],
 *   interpolationQualifiers?: string[],
 *   attributes?: string[],
 * }} extension Extension entry to project into keyword categories.
 * @returns {KeywordBucketInput} Sparse keyword bucket.
 */
function keywordBucketFromExtension(extension) {
  return {
    types: extension.typeKeywords,
    storage: extension.storageQualifiers,
    precision: extension.precisionQualifiers,
    interpolation: extension.interpolationQualifiers,
    attributes: extension.attributes,
  };
}

/**
 * Returns a sorted array of unique strings.
 *
 * @param {string[]} values Strings to sort and deduplicate.
 * @returns {string[]} Sorted unique strings.
 */
function sortedUnique(values) {
  return Array.from(new Set(values)).sort();
}

/**
 * Normalizes a keyword bucket by deduplicating and sorting each category.
 *
 * @param {KeywordBucketInput} bucket Keyword bucket to normalize.
 * @returns {KeywordBucket} Normalized keyword bucket.
 */
function normalizeKeywordBucket(bucket) {
  return {
    types: sortedUnique(bucket.types || []),
    storage: sortedUnique(bucket.storage || []),
    precision: sortedUnique(bucket.precision || []),
    interpolation: sortedUnique(bucket.interpolation || []),
    attributes: sortedUnique(bucket.attributes || []),
  };
}

/**
 * Normalizes the full keyword registry, including extension entry order.
 *
 * @param {KeywordRegistryInput} registry Keyword registry to normalize.
 * @returns {KeywordRegistry} Normalized keyword registry.
 */
function normalizeKeywordRegistry(registry) {
  /** @type {[string, KeywordBucketInput][]} */
  const extensionEntries = Object.entries(registry.extensions).map(
    ([name, bucket]) =>
      /** @type {[string, KeywordBucketInput]} */ ([name, bucket]),
  );

  return {
    core: normalizeKeywordBucket(registry.core),
    glsl: normalizeKeywordBucket(registry.glsl),
    vulkan: normalizeKeywordBucket(registry.vulkan),
    extensions: Object.fromEntries(
      extensionEntries
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, bucket]) => [name, normalizeKeywordBucket(bucket)]),
    ),
  };
}

/**
 * Extracts a single keyword category as a core/GLSL/Vulkan/extensions group.
 *
 * @param {KeywordRegistry} registry Keyword registry to read from.
 * @param {KeywordCategory} category Keyword category to extract.
 * @returns {KeywordGroup} Keyword group for the requested category.
 */
function keywordGroupFromCategory(registry, category) {
  return {
    core: registry.core[category],
    glsl: registry.glsl[category],
    vulkan: registry.vulkan[category],
    extensions: Object.values(registry.extensions).flatMap(
      (bucket) => bucket[category],
    ),
  };
}

/**
 * Flattens grouped keyword lists while preserving the declared scope order.
 *
 * @param {KeywordGroup} keywords Grouped keywords to flatten.
 * @returns {string[]} Unique flattened keyword list.
 */
function flattenKeywordGroups(keywords) {
  return Array.from(
    new Set([
      ...keywords.core,
      ...keywords.glsl,
      ...keywords.vulkan,
      ...(keywords.extensions || []),
    ]),
  );
}

/** @type {KeywordRegistry} */
const KEYWORDS = normalizeKeywordRegistry({
  core: {
    types: [
      'void',
      'float',
      'int',
      'uint',
      'bool',
      'vec2',
      'vec3',
      'vec4',
      'bvec2',
      'bvec3',
      'bvec4',
      'ivec2',
      'ivec3',
      'ivec4',
      'uvec2',
      'uvec3',
      'uvec4',
      'mat2',
      'mat3',
      'mat4',
      'mat2x2',
      'mat2x3',
      'mat2x4',
      'mat3x2',
      'mat3x3',
      'mat3x4',
      'mat4x2',
      'mat4x3',
      'mat4x4',
      'atomic_uint',
      'sampler2D',
      'sampler3D',
      'samplerCube',
      'sampler2DShadow',
      'samplerCubeShadow',
      'sampler2DArray',
      'sampler2DArrayShadow',
      'samplerCubeArray',
      'samplerCubeArrayShadow',
      'isampler2D',
      'isampler3D',
      'isamplerCube',
      'isampler2DArray',
      'isamplerCubeArray',
      'usampler2D',
      'usampler3D',
      'usamplerCube',
      'usampler2DArray',
      'usamplerCubeArray',
      'samplerBuffer',
      'isamplerBuffer',
      'usamplerBuffer',
      'sampler2DMS',
      'isampler2DMS',
      'usampler2DMS',
      'sampler2DMSArray',
      'isampler2DMSArray',
      'usampler2DMSArray',
      'image2D',
      'iimage2D',
      'uimage2D',
      'image3D',
      'iimage3D',
      'uimage3D',
      'imageCube',
      'iimageCube',
      'uimageCube',
      'imageBuffer',
      'iimageBuffer',
      'uimageBuffer',
      'image2DArray',
      'iimage2DArray',
      'uimage2DArray',
      'imageCubeArray',
      'iimageCubeArray',
      'uimageCubeArray',
    ],
    storage: [
      'attribute',
      'const',
      'in',
      'out',
      'inout',
      'centroid',
      'patch',
      'sample',
      'uniform',
      'varying',
      'buffer',
      'shared',
      'coherent',
      'volatile',
      'restrict',
      'readonly',
      'writeonly',
    ],
    precision: ['highp', 'mediump', 'lowp'],
    interpolation: ['smooth', 'flat', 'noperspective'],
    attributes: [
      'shared',
      'points',
      'lines',
      'triangles',
      'max_vertices',
      'max_primitives',
      'local_size_x',
      'local_size_y',
      'local_size_z',
      'local_size_x_id',
      'local_size_y_id',
      'local_size_z_id',
    ],
  },
  glsl: {
    types: [
      'double',
      'dvec2',
      'dvec3',
      'dvec4',
      'dmat2',
      'dmat3',
      'dmat4',
      'dmat2x2',
      'dmat2x3',
      'dmat2x4',
      'dmat3x2',
      'dmat3x3',
      'dmat3x4',
      'dmat4x2',
      'dmat4x3',
      'dmat4x4',
      'sampler1D',
      'sampler1DShadow',
      'sampler1DArray',
      'sampler1DArrayShadow',
      'isampler1D',
      'isampler1DArray',
      'usampler1D',
      'usampler1DArray',
      'sampler2DRect',
      'sampler2DRectShadow',
      'isampler2DRect',
      'usampler2DRect',
      'texture2DRect',
      'itexture2DRect',
      'utexture2DRect',
      'image1D',
      'iimage1D',
      'uimage1D',
      'image1DArray',
      'iimage1DArray',
      'uimage1DArray',
      'image2DRect',
      'iimage2DRect',
      'uimage2DRect',
      'image2DMS',
      'iimage2DMS',
      'uimage2DMS',
      'image2DMSArray',
      'iimage2DMSArray',
      'uimage2DMSArray',
    ],
    storage: ['subroutine'],
  },
  vulkan: {
    types: [
      'texture1D',
      'texture2D',
      'texture3D',
      'textureCube',
      'texture1DArray',
      'texture2DArray',
      'textureBuffer',
      'texture2DMS',
      'texture2DMSArray',
      'textureCubeArray',
      'itexture1D',
      'itexture2D',
      'itexture3D',
      'itextureCube',
      'itexture1DArray',
      'itexture2DArray',
      'itextureBuffer',
      'itexture2DMS',
      'itexture2DMSArray',
      'itextureCubeArray',
      'utexture1D',
      'utexture2D',
      'utexture3D',
      'utextureCube',
      'utexture1DArray',
      'utexture2DArray',
      'utextureBuffer',
      'utexture2DMS',
      'utexture2DMSArray',
      'utextureCubeArray',
      'sampler',
      'samplerShadow',
      'subpassInput',
      'subpassInputMS',
      'isubpassInput',
      'isubpassInputMS',
      'usubpassInput',
      'usubpassInputMS',
    ],
  },
  extensions: Object.fromEntries(
    Object.entries(EXTENSIONS).map(([name, extension]) => [
      name,
      keywordBucketFromExtension(extension),
    ]),
  ),
});

const TYPE_KEYWORDS = keywordGroupFromCategory(KEYWORDS, 'types');
const STORAGE_QUALIFIER_KEYWORDS = keywordGroupFromCategory(
  KEYWORDS,
  'storage',
);
const PRECISION_QUALIFIER_KEYWORDS = keywordGroupFromCategory(
  KEYWORDS,
  'precision',
);
const INTERPOLATION_QUALIFIER_KEYWORDS = keywordGroupFromCategory(
  KEYWORDS,
  'interpolation',
);
const ATTRIBUTE_KEYWORDS = keywordGroupFromCategory(KEYWORDS, 'attributes');

/**
 * Qualifier keywords highlighted as `@type.qualifier`.
 * `const` and `subroutine` stay out because they are already highlighted more
 * specifically by structural query rules.
 *
 * @type {KeywordGroup}
 */
const HIGHLIGHT_TYPE_QUALIFIER_KEYWORDS = {
  core: [
    ...STORAGE_QUALIFIER_KEYWORDS.core.filter((keyword) => keyword !== 'const'),
    ...PRECISION_QUALIFIER_KEYWORDS.core,
    ...INTERPOLATION_QUALIFIER_KEYWORDS.core,
  ],
  glsl: [],
  vulkan: [],
  extensions: [
    ...STORAGE_QUALIFIER_KEYWORDS.extensions,
    ...PRECISION_QUALIFIER_KEYWORDS.extensions,
    ...INTERPOLATION_QUALIFIER_KEYWORDS.extensions,
  ],
};

export {
  KEYWORDS,
  ATTRIBUTE_KEYWORDS,
  HIGHLIGHT_TYPE_QUALIFIER_KEYWORDS,
  INTERPOLATION_QUALIFIER_KEYWORDS,
  PRECISION_QUALIFIER_KEYWORDS,
  STORAGE_QUALIFIER_KEYWORDS,
  TYPE_KEYWORDS,
  flattenKeywordGroups,
  keywordGroupFromCategory,
};
