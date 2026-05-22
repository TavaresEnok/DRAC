import { Pressable, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type { Direction } from '../types';

type Props = {
  label: string;
  direction: Direction;
  disabled?: boolean;
  active?: boolean;
  onPress: (direction: Direction) => void;
  style?: StyleProp<ViewStyle>;
  buttonStyle: StyleProp<ViewStyle>;
  activeButtonStyle: StyleProp<ViewStyle>;
  disabledStyle: StyleProp<ViewStyle>;
  textStyle: StyleProp<TextStyle>;
  activeTextStyle: StyleProp<TextStyle>;
};

export function PtzButton({ label, direction, disabled, active, onPress, style, buttonStyle, activeButtonStyle, disabledStyle, textStyle, activeTextStyle }: Props) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => onPress(direction)}
      style={({ pressed }) => [buttonStyle, style, (pressed || active) && activeButtonStyle, disabled && disabledStyle]}
    >
      {({ pressed }) => <Text style={[textStyle, (pressed || active) && activeTextStyle]}>{label}</Text>}
    </Pressable>
  );
}
