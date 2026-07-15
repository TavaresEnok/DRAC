import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export function SkeletonBlock({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const { theme } = useTheme();
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.9, duration: 720, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.45, duration: 720, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return <Animated.View style={[styles.block, { backgroundColor: theme.surfaceAlt, opacity }, style]} />;
}

export function CameraGridSkeleton() {
  return (
    <View style={styles.grid} accessibilityLabel="Carregando câmeras">
      <SkeletonBlock style={styles.hero} />
      <View style={styles.row}>
        <SkeletonBlock style={styles.tile} />
        <SkeletonBlock style={styles.tile} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { borderRadius: 18, overflow: 'hidden' },
  grid: { gap: 11 },
  hero: { height: 190 },
  row: { flexDirection: 'row', gap: 11 },
  tile: { height: 124, flex: 1 },
});
