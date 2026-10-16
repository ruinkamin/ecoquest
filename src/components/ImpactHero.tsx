import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const ImpactHero: React.FC = () => {
  const [floatValues] = useState(() =>
    Array.from({ length: 8 }, () => new Animated.Value(0)),
  );

  useEffect(() => {
    const animations = Array.from({ length: 4 }, (_, index) => {
      const horizontal = floatValues[index * 2];
      const vertical = floatValues[index * 2 + 1];
      const direction = index % 2 === 0 ? 1 : -1;
      const drift = (x: number, y: number) =>
        Animated.parallel([
          Animated.timing(horizontal, {
            toValue: x,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(vertical, {
            toValue: y,
            duration: 1800,
            useNativeDriver: true,
          }),
        ]);

      return Animated.loop(
        Animated.sequence([
          Animated.delay(index * 220),
          drift(direction * 10, direction * -8),
          drift(direction * -8, direction * 9),
          drift(0, 0),
        ]),
      );
    });
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [floatValues]);

  return (
    <View style={styles.heroBanner} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.heroGlow} />
      <View style={styles.heroRings}>
        <View style={[styles.heroRing, styles.heroRingOuter]} />
        <View style={[styles.heroRing, styles.heroRingMiddle]} />
        <View style={[styles.heroRing, styles.heroRingInner]} />
      </View>
      <View style={styles.heroLogoRim} />
      <View style={styles.heroLogoCircle}>
        <Ionicons name="leaf" size={56} color="#064E3B" />
      </View>
      <Ionicons name="sparkles" size={15} color="rgba(255,255,255,0.9)" style={styles.heroSparkleTop} />
      <Ionicons name="sparkles" size={11} color="rgba(255,255,255,0.7)" style={styles.heroSparkleSide} />
      <Animated.View
        style={[
          styles.heroFloat,
          styles.heroTeamBadge,
          { transform: [{ translateX: floatValues[0] }, { translateY: floatValues[1] }] },
        ]}
      >
        <Ionicons name="people" size={17} color="#111827" />
        <Text style={styles.heroTeamText}>Команда з 5</Text>
      </Animated.View>
      <Animated.View
        style={[
          styles.heroFloat,
          styles.heroXpBadge,
          { transform: [{ translateX: floatValues[2] }, { translateY: floatValues[3] }] },
        ]}
      >
        <Ionicons name="flash" size={16} color="#422006" />
        <Text style={styles.heroXpText}>+150 XP</Text>
      </Animated.View>
      <Animated.View
        style={[
          styles.heroFloat,
          styles.heroImpactBadge,
          { transform: [{ translateX: floatValues[4] }, { translateY: floatValues[5] }] },
        ]}
      >
        <Ionicons name="location" size={16} color="#047857" />
        <Text style={styles.heroImpactText}>Точку прибрано</Text>
      </Animated.View>
      <Animated.View
        style={[
          styles.heroFloat,
          styles.heroLevelBadge,
          { transform: [{ translateX: floatValues[6] }, { translateY: floatValues[7] }] },
        ]}
      >
        <Ionicons name="ribbon" size={16} color="#047857" />
        <Text style={styles.heroLevelText}>Рівень 7</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  heroBanner: {
    height: 320,
    width: '100%',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#5B2FEF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    borderBottomWidth: 5,
    borderBottomColor: '#4020C8',
    shadowColor: '#3515A5',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  heroGlow: {
    position: 'absolute',
    width: '110%',
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(151,117,255,0.16)',
  },
  heroRings: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroRing: {
    position: 'absolute',
    borderRadius: 999,
  },
  heroRingOuter: {
    width: '84%',
    aspectRatio: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroRingMiddle: {
    width: '60%',
    aspectRatio: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroRingInner: {
    width: '36%',
    aspectRatio: 1,
    backgroundColor: 'rgba(255,255,255,0.19)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  heroLogoRim: {
    position: 'absolute',
    width: 142,
    height: 142,
    borderRadius: 71,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  heroLogoCircle: {
    position: 'absolute',
    width: 122,
    height: 122,
    borderRadius: 61,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#32D894',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    borderBottomWidth: 6,
    borderBottomColor: '#079968',
    elevation: 5,
    shadowColor: '#064E3B',
    shadowOpacity: 0.24,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 5 },
  },
  heroSparkleTop: { position: 'absolute', top: '31%', right: '29%' },
  heroSparkleSide: { position: 'absolute', bottom: '31%', left: '29%' },
  heroFloat: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    elevation: 3,
    shadowColor: '#21104F',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
  },
  heroTeamBadge: { top: '25%', left: '6%', backgroundColor: '#FFFFFF' },
  heroTeamText: { color: '#111827', fontWeight: '800', fontSize: 13 },
  heroXpBadge: { top: '16%', right: '18%', backgroundColor: '#FFC21A' },
  heroXpText: { color: '#422006', fontWeight: '800', fontSize: 13 },
  heroImpactBadge: { bottom: '17%', left: '7%', backgroundColor: '#FFFFFF' },
  heroImpactText: { color: '#047857', fontWeight: '800', fontSize: 13 },
  heroLevelBadge: { bottom: '20%', right: '13%', backgroundColor: '#D1FAE5' },
  heroLevelText: { color: '#047857', fontWeight: '800', fontSize: 13 },
});
