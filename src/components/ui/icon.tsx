import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, type ColorValue } from 'react-native';

type SFName = Extract<SymbolViewProps['name'], string>;
type MaterialName = NonNullable<Exclude<SymbolViewProps['name'], string>['web']>;

/** SF Symbols on iOS; the closest Material Symbol on web and Android. */
const MATERIAL: Partial<Record<SFName, MaterialName>> = {
  'arrow.clockwise': 'refresh',
  'backward.fill': 'fast_rewind',
  'forward.fill': 'fast_forward',
  'camera.fill': 'photo_camera',
  'checkmark.circle.fill': 'check_circle',
  checkmark: 'check',
  'chevron.right': 'chevron_right',
  'doc.text': 'description',
  'exclamationmark.circle.fill': 'error',
  'flame.fill': 'local_fire_department',
  'hand.raised.fill': 'front_hand',
  headphones: 'headphones',
  'mic.fill': 'mic',
  'pause.fill': 'pause',
  'play.fill': 'play_arrow',
  'photo.on.rectangle': 'photo_library',
  'rectangle.on.rectangle.angled': 'style',
  'speaker.wave.2.fill': 'volume_up',
  'text.bubble.fill': 'chat_bubble',
  'theatermasks.fill': 'theater_comedy',
  'xmark.circle.fill': 'cancel',
  xmark: 'close',
  clock: 'schedule',
  gearshape: 'settings',
  plus: 'add',
  trash: 'delete',
  sparkles: 'auto_awesome',
  waveform: 'graphic_eq',
  'person.fill': 'person',
  'envelope.fill': 'mail',
  pencil: 'edit',
};

type IconProps = {
  name: SFName;
  size?: number;
  color: ColorValue;
  weight?: SymbolViewProps['weight'];
};

export function Icon({ name, size = 22, color, weight = 'semibold' }: IconProps) {
  const material = MATERIAL[name];
  const symbol: SymbolViewProps['name'] =
    Platform.OS === 'ios' || !material ? name : { ios: name, android: material, web: material };
  return (
    <SymbolView
      name={symbol}
      size={size}
      tintColor={color}
      weight={Platform.OS === 'ios' ? weight : undefined}
      resizeMode="scaleAspectFit"
      style={{ width: size, height: size }}
    />
  );
}
