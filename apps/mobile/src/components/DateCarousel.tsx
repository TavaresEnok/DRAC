import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from '../styles/colors';

export type DateItem = {
  key: string;       // 'YYYY-MM-DD'
  day: string;       // 'Seg', 'Ter', 'Qua' …
  date: number;      // dia do mês
  hasRecordings: boolean;
  selected: boolean;
};

interface DateCarouselProps {
  dates: DateItem[];
  onSelect: (key: string) => void;
}

export function DateCarousel({ dates, onSelect }: DateCarouselProps) {
  return (
    <View style={s.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.row}
      >
        {dates.map((item) => (
          <Pressable key={item.key} onPress={() => onSelect(item.key)} style={s.item}>
            {/* Pílula do dia */}
            <View style={[s.pill, item.selected && s.pillActive]}>
              <Text style={[s.dayLabel, item.selected && s.labelActive]}>
                {item.day}
              </Text>
              <Text style={[s.dateNum, item.selected && s.labelActive]}>
                {item.date}
              </Text>
            </View>

            {/* Ponto indicador de gravação (visível só quando tem gravação e não está selecionado) */}
            <View
              style={[
                s.dot,
                item.hasRecordings && !item.selected ? s.dotVisible : s.dotHidden,
              ]}
            />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  row: {
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 2,
  },
  item: {
    alignItems: 'center',
    minWidth: 48,
    gap: 4,
  },
  pill: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillActive: {
    backgroundColor: C.accent,
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.textMuted,
    textTransform: 'capitalize',
  },
  dateNum: {
    fontSize: 14,
    fontWeight: '800',
    color: C.textSub,
    marginTop: 1,
  },
  labelActive: {
    color: C.textOnAccent,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dotVisible: {
    backgroundColor: C.accent,
  },
  dotHidden: {
    backgroundColor: 'transparent',
  },
});
