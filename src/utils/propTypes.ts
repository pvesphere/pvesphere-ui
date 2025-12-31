/*
 * Copyright (c) 2025 PveSphere Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { CSSProperties, VNodeChild } from "vue";
import {
  createTypes,
  toValidableType,
  type VueTypesInterface,
  type VueTypeValidableDef
} from "vue-types";

export type VueNode = VNodeChild | JSX.Element;

type PropTypes = VueTypesInterface & {
  readonly style: VueTypeValidableDef<CSSProperties>;
  readonly VNodeChild: VueTypeValidableDef<VueNode>;
};

const newPropTypes = createTypes({
  func: undefined,
  bool: undefined,
  string: undefined,
  number: undefined,
  object: undefined,
  integer: undefined
}) as PropTypes;

// 从 vue-types v5.0 开始，extend()方法已经废弃，当前已改为官方推荐的ES6+方法 https://dwightjack.github.io/vue-types/advanced/extending-vue-types.html#the-extend-method
export default class propTypes extends newPropTypes {
  // a native-like validator that supports the `.validable` method
  static get style() {
    return toValidableType("style", {
      type: [String, Object]
    });
  }

  static get VNodeChild() {
    return toValidableType("VNodeChild", {
      type: undefined
    });
  }
}
