import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  PanResponder,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../theme';
import { Badge, Button } from '../components/Common';
import { ApiUser, ImpactItem, MapReport, PlatformStats, Quest, api, getPhotoUrl } from '../api';

interface Region {
  latitude: number;
  longitude: number;
  longitudeDelta: number;
}

type Layer = 'quests' | 'reports' | 'impact';

interface Props {
  colors: ThemeColors;
  isAuthed: boolean;
  onRequireAuth: () => void;
  onSelectTask: (task: Quest) => void;
  onOpenReportModal: () => void;
  refreshKey?: number;
  focusImpactId?: number | null;
}

const INITIAL_REGION: Region = {
  latitude: 48.4647,
  longitude: 35.0462,
  longitudeDelta: 0.22,
};

const TILE_SIZE = 256;
const MIN_TILE_ZOOM = 3;
const MAX_TILE_ZOOM = 19;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const longitudeToWorldX = (longitude: number, worldSize: number) =>
  ((longitude + 180) / 360) * worldSize;

const latitudeToWorldY = (latitude: number, worldSize: number) => {
  const limitedLatitude = clamp(latitude, -85.05112878, 85.05112878);
  const sinLatitude = Math.sin((limitedLatitude * Math.PI) / 180);
  return (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * worldSize;
};

const worldYToLatitude = (worldY: number, worldSize: number) => {
  const normalizedY = clamp(worldY / worldSize, 0, 1);
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * normalizedY))) * 180) / Math.PI;
};

export const MapScreen: React.FC<Props> = ({
  colors,
  isAuthed,
  onRequireAuth,
  onSelectTask,
  onOpenReportModal,
  refreshKey = 0,
  focusImpactId = null,
}) => {
  const [region, setRegion] = useState(INITIAL_REGION);
  const [mapSize, setMapSize] = useState({ width: 1, height: 1 });
  const [layer, setLayer] = useState<Layer>('quests');
  const [filterMode, setFilterMode] = useState<'all' | 'available'>('available');
  const [query, setQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<number | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [reports, setReports] = useState<MapReport[]>([]);
  const [impacts, setImpacts] = useState<ImpactItem[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
  const [selectedImpact, setSelectedImpact] = useState<ImpactItem | null>(null);
  const [selectedReport, setSelectedReport] = useState<MapReport | null>(null);
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loadedQuery, setLoadedQuery] = useState('');
  const [error, setError] = useState('');
  const [mapTileError, setMapTileError] = useState(false);
  const [mapPan] = useState(() => new Animated.ValueXY());
  const requestNumber = useRef(0);
  useEffect(() => {
    const timeout = setTimeout(() => setSearchFilter(query.trim().slice(0, 100)), 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const mapProjection = useMemo(() => {
    const rawZoom = Math.log2((360 * mapSize.width) / (TILE_SIZE * region.longitudeDelta));
    const zoom = clamp(Math.floor(rawZoom), MIN_TILE_ZOOM, MAX_TILE_ZOOM);
    const tileScale = 2 ** (rawZoom - zoom);
    const tileSize = TILE_SIZE * tileScale;
    const worldSize = tileSize * 2 ** zoom;
    const centerX = longitudeToWorldX(region.longitude, worldSize);
    const centerY = latitudeToWorldY(region.latitude, worldSize);
    return {
      zoom,
      tileSize,
      worldSize,
      centerY,
      originX: centerX - mapSize.width / 2,
      originY: centerY - mapSize.height / 2,
    };
  }, [mapSize, region]);
  const bbox = useMemo(() => {
    const minLng = (mapProjection.originX / mapProjection.worldSize) * 360 - 180;
    const maxLng =
      ((mapProjection.originX + mapSize.width) / mapProjection.worldSize) * 360 - 180;
    const minLat = worldYToLatitude(mapProjection.originY + mapSize.height, mapProjection.worldSize);
    const maxLat = worldYToLatitude(mapProjection.originY, mapProjection.worldSize);
    return [
      clamp(minLng, -180, 180),
      minLat,
      clamp(maxLng, -180, 180),
      maxLat,
    ].join(',');
  }, [mapProjection, mapSize]);
  const mapTiles = useMemo(() => {
    if (mapSize.width <= 1 || mapSize.height <= 1) return [];
    const tileCount = 2 ** mapProjection.zoom;
    const firstTileX = Math.floor(mapProjection.originX / mapProjection.tileSize) - 1;
    const lastTileX =
      Math.floor((mapProjection.originX + mapSize.width) / mapProjection.tileSize) + 1;
    const firstTileY = Math.floor(mapProjection.originY / mapProjection.tileSize) - 1;
    const lastTileY =
      Math.floor((mapProjection.originY + mapSize.height) / mapProjection.tileSize) + 1;
    const tiles: {
      key: string;
      uri: string;
      left: number;
      top: number;
      size: number;
    }[] = [];

    for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
      for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
        if (tileY < 0 || tileY >= tileCount) continue;
        const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
        tiles.push({
          key: `${mapProjection.zoom}/${wrappedX}/${tileY}`,
          uri: `https://tile.openstreetmap.org/${mapProjection.zoom}/${wrappedX}/${tileY}.png`,
          left: tileX * mapProjection.tileSize - mapProjection.originX,
          top: tileY * mapProjection.tileSize - mapProjection.originY,
          size: mapProjection.tileSize,
        });
      }
    }
    return tiles;
  }, [mapProjection, mapSize]);
  const queryId = `${bbox}|${filterMode}|${searchFilter}|${difficultyFilter ?? ''}|${refreshKey}`;
  const loading = loadedQuery !== queryId;

  const loadMap = useCallback(async () => {
    const currentRequest = requestNumber.current + 1;
    requestNumber.current = currentRequest;
    try {
      const [questItems, reportItems, impactItems, publicStats] = await Promise.all([
        api.getQuests(bbox, filterMode === 'available', 200, searchFilter, difficultyFilter ?? undefined),
        api.getReports(bbox),
        api.getImpact(bbox),
        api.getStats(),
      ]);
      if (requestNumber.current === currentRequest) {
        setQuests(questItems);
        setReports(reportItems);
        setImpacts(impactItems);
        setStats(publicStats);
        setError('');
      }
    } catch (loadError: unknown) {
      if (requestNumber.current === currentRequest) {
        setError(loadError instanceof Error ? loadError.message : 'Не вдалося завантажити мапу.');
      }
    } finally {
      if (requestNumber.current === currentRequest) setLoadedQuery(queryId);
    }
  }, [bbox, difficultyFilter, filterMode, queryId, searchFilter]);

  useEffect(() => {
    void Promise.resolve().then(loadMap);
  }, [loadMap]);

  useEffect(() => {
    if (focusImpactId === null) return;
    const impact = impacts.find((item) => item.quest_id === focusImpactId);
    if (!impact) return;
    void Promise.resolve().then(() => {
      setLayer('impact');
      setSelectedQuest(null);
      setSelectedReport(null);
      setSelectedImpact(impact);
    });
  }, [focusImpactId, impacts]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) + Math.abs(gesture.dy) > 8,
        onPanResponderMove: (_event, gesture) => mapPan.setValue({ x: gesture.dx, y: gesture.dy }),
        onPanResponderRelease: (_event, gesture) => {
          setRegion({
            ...region,
            longitude: clamp(
              region.longitude - (gesture.dx / Math.max(mapSize.width, 1)) * region.longitudeDelta,
              -180,
              180,
            ),
            latitude: worldYToLatitude(
              mapProjection.centerY - gesture.dy,
              mapProjection.worldSize,
            ),
          });
          mapPan.setValue({ x: 0, y: 0 });
        },
        onPanResponderTerminate: () => {
          Animated.spring(mapPan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
        },
      }),
    [mapPan, region, mapSize, mapProjection],
  );

  const pointStyle = (latitude: number, longitude: number) => ({
    left: longitudeToWorldX(longitude, mapProjection.worldSize) - mapProjection.originX - 38,
    top: latitudeToWorldY(latitude, mapProjection.worldSize) - mapProjection.originY - 18,
  });

  const searchMatches = (title?: string | null, place?: string | null) =>
    `${title || ''} ${place || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());

  const visibleQuests = quests.filter((quest) =>
    searchMatches(quest.title, `${quest.description || ''} ${quest.owner_org_name || ''}`),
  );
  const visibleReports = reports.filter((report) => searchMatches(report.description));
  const visibleImpacts = impacts.filter((impact) => searchMatches(impact.title, impact.owner_org_name));

  const centerOnMyLocation = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError('Дозвольте доступ до геолокації в налаштуваннях телефону, щоб перейти до вашого місця.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setRegion((current) => ({
        ...current,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      }));
      setMyLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      setError('');
    } catch (locationError: unknown) {
      setError(locationError instanceof Error ? locationError.message : 'Не вдалося визначити місце.');
    }
  };

  const zoomMap = (factor: number) => {
    setRegion((current) => ({
      ...current,
      longitudeDelta: clamp(current.longitudeDelta * factor, 0.004, 0.5),
    }));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.headingRow}>
          <View>
            <Text style={[styles.heading, { color: colors.textPrimary }]}>EcoQuest</Text>
          </View>
          <TouchableOpacity
            style={[styles.locateButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={centerOnMyLocation}
            accessibilityRole="button"
            accessibilityLabel="Моє місцезнаходження"
          >
            <Ionicons name="locate-outline" size={20} color={colors.primaryDark} />
          </TouchableOpacity>
        </View>
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
          <TextInput
            placeholder="Пошук квесту або опису"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.textPrimary }]}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            accessibilityLabel="Пошук квесту або організації"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Очистити пошук">
              <Ionicons name="close-circle" size={19} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {([
            ['quests', 'Квести'],
            ['reports', 'Активності'],
            ['impact', 'Мапа змін'],
          ] as [Layer, string][]).map(([nextLayer, label]) => (
            <TouchableOpacity
              key={nextLayer}
              style={[
                styles.filterChip,
                { borderColor: colors.border },
                layer === nextLayer && { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
              ]}
              onPress={() => {
                setLayer(nextLayer);
                setSelectedQuest(null);
                setSelectedImpact(null);
                setSelectedReport(null);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: layer === nextLayer }}
            >
              <Text style={[styles.filterText, { color: layer === nextLayer ? colors.card : colors.textSecondary }]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
          {layer === 'quests' && (
            <>
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  { borderColor: colors.border },
                  filterMode === 'available' && { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                ]}
                onPress={() => setFilterMode((value) => (value === 'available' ? 'all' : 'available'))}
                accessibilityRole="button"
                accessibilityState={{ selected: filterMode === 'available' }}
              >
                <Text style={[styles.filterText, { color: filterMode === 'available' ? colors.primaryDark : colors.textSecondary }]}>
                  {filterMode === 'available' ? 'Тільки доступні' : 'Усі статуси'}
                </Text>
              </TouchableOpacity>
              {[null, 1, 2, 3, 4, 5].map((difficulty) => (
                <TouchableOpacity
                  key={difficulty ?? 'any-difficulty'}
                  style={[
                    styles.filterChip,
                    { borderColor: colors.border },
                    difficultyFilter === difficulty && { backgroundColor: colors.goldLight, borderColor: colors.gold },
                  ]}
                  onPress={() => setDifficultyFilter(difficulty)}
                  accessibilityRole="button"
                  accessibilityLabel={difficulty === null ? 'Будь-яка складність' : `Складність ${difficulty}`}
                  accessibilityState={{ selected: difficultyFilter === difficulty }}
                >
                  <Text style={[
                    styles.filterText,
                    { color: difficultyFilter === difficulty ? colors.textPrimary : colors.textSecondary },
                  ]}>
                    {difficulty === null ? 'Будь-яка' : `${difficulty} ★`}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      </View>

      {stats && (
        <View style={[styles.statsStrip, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Stat label="Місць змінено" value={stats.places_cleaned} colors={colors} />
          <Stat label="Активностей" value={stats.reports_total} colors={colors} />
          <Stat label="Волонтерів" value={stats.volunteers} colors={colors} />
        </View>
      )}

      <View
        style={[styles.map, { backgroundColor: colors.mapLand }]}
        onLayout={(event) => setMapSize(event.nativeEvent.layout)}
        {...panResponder.panHandlers}
      >
        <Animated.View style={[styles.mapContents, { transform: mapPan.getTranslateTransform() }]}>
          {mapTiles.map((tile) => (
            <Image
              key={tile.key}
              source={{ uri: tile.uri }}
              style={[styles.mapTile, { left: tile.left, top: tile.top, width: tile.size, height: tile.size }]}
              resizeMode="stretch"
              onLoad={() => setMapTileError(false)}
              onError={() => setMapTileError(true)}
            />
          ))}

          {layer === 'quests' &&
            visibleQuests.map((quest) => (
              <TouchableOpacity
                key={quest.id}
                onPress={() => {
                  setSelectedQuest(quest);
                  setSelectedImpact(null);
                }}
                style={[styles.marker, pointStyle(quest.lat, quest.lng)]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Квест: ${quest.title || 'Без назви'}`}
              >
                <View style={[styles.markerIcon, { backgroundColor: quest.status === 'available' ? colors.primary : colors.secondaryPurple }]}>
                  <Ionicons name={quest.status === 'available' ? 'leaf' : 'time'} size={16} color="#fff" />
                </View>
                <View style={[styles.markerBadge, { backgroundColor: colors.card }]}>
                  <Text style={[styles.markerBadgeText, { color: colors.textPrimary }]}>+{quest.reward_xp || 0} XP</Text>
                </View>
              </TouchableOpacity>
            ))}

          {layer === 'reports' &&
            visibleReports.map((report) => (
              <TouchableOpacity
                key={report.id}
                onPress={() => {
                  setSelectedReport(report);
                  setSelectedQuest(null);
                  setSelectedImpact(null);
                }}
                style={[styles.marker, pointStyle(report.lat, report.lng)]}
                accessibilityRole="button"
                accessibilityLabel="Активність"
              >
                <View style={[styles.markerIcon, { backgroundColor: colors.gold }]}>
                  <Ionicons name="alert" size={16} color="#fff" />
                </View>
              </TouchableOpacity>
            ))}

          {layer === 'impact' &&
            visibleImpacts.map((impact) => (
              <TouchableOpacity
                key={impact.quest_id}
                onPress={() => {
                  setSelectedImpact(impact);
                  setSelectedQuest(null);
                }}
                style={[styles.marker, pointStyle(impact.lat, impact.lng)]}
                accessibilityRole="button"
                accessibilityLabel={`Виконане завдання: ${impact.title || ''}`}
              >
                <View style={[styles.markerIcon, { backgroundColor: colors.secondaryPurple }]}>
                  <Ionicons name="checkmark" size={17} color="#fff" />
                </View>
                <View style={[styles.percentBadge, { backgroundColor: colors.card }]}>
                  <Text style={[styles.markerBadgeText, { color: colors.primaryDark }]}>{impact.final_percent}%</Text>
                </View>
              </TouchableOpacity>
            ))}
          {myLocation ? (
            <View
              pointerEvents="none"
              style={[
                styles.myLocationMarker,
                {
                  left: longitudeToWorldX(myLocation.longitude, mapProjection.worldSize) - mapProjection.originX - 10,
                  top: latitudeToWorldY(myLocation.latitude, mapProjection.worldSize) - mapProjection.originY - 10,
                },
              ]}
            >
              <View style={styles.myLocationDot} />
            </View>
          ) : null}
        </Animated.View>

        {!loading && !error && (
          (layer === 'quests' && visibleQuests.length === 0) ||
          (layer === 'reports' && visibleReports.length === 0) ||
          (layer === 'impact' && visibleImpacts.length === 0)
        ) ? (
          <View pointerEvents="none" style={[styles.emptyMapCard, { backgroundColor: colors.card }]}>
            <View style={[styles.emptyMapIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name={query ? 'search-outline' : 'leaf-outline'} size={20} color={colors.primaryDark} />
            </View>
            <Text style={[styles.emptyMapTitle, { color: colors.textPrimary }]}>
              {query
                ? 'Нічого не знайдено'
                : layer === 'quests' && filterMode === 'available'
                  ? 'Поруч немає доступних квестів'
                  : 'Поки немає точок'}
            </Text>
            <Text style={[styles.emptyMapText, { color: colors.textSecondary }]}>
              {query
                ? 'Спробуйте змінити пошук або фільтри.'
                : layer === 'quests' && filterMode === 'available'
                  ? 'Покажіть усі статуси або перейдіть до іншої ділянки.'
                  : 'Пересуньте мапу або створіть нову активність.'}
            </Text>
          </View>
        ) : null}

        {loading && (
          <View style={[styles.loadingChip, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="small" color={colors.primaryDark} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Оновлюємо мапу</Text>
          </View>
        )}
        {error ? (
          <View style={[styles.errorChip, { backgroundColor: colors.card }]}>
            <Text style={[styles.errorText, { color: colors.danger }]} numberOfLines={2}>{error}</Text>
            <TouchableOpacity onPress={() => {
              setLoadedQuery('');
              void loadMap();
            }} accessibilityRole="button" accessibilityLabel="Оновити мапу">
              <Ionicons name="refresh" size={19} color={colors.primaryDark} />
            </TouchableOpacity>
          </View>
        ) : null}
        {mapTileError && !error ? (
          <View style={[styles.errorChip, { backgroundColor: colors.card }]}>
            <Text style={[styles.errorText, { color: colors.danger }]} numberOfLines={2}>
              Не вдалося завантажити фрагменти мапи. Перевірте інтернет-з&apos;єднання.
            </Text>
          </View>
        ) : null}
        <TouchableOpacity
          style={[styles.addReportFab, { backgroundColor: colors.primary }]}
          onPress={isAuthed ? onOpenReportModal : onRequireAuth}
          accessibilityRole="button"
          accessibilityLabel="Додати активність"
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={[styles.panHint, { backgroundColor: colors.card }]}>
          <Ionicons name="move-outline" size={14} color={colors.textSecondary} />
          <Text style={[styles.panHintText, { color: colors.textSecondary }]}>Перетягніть мапу</Text>
        </View>
        <View style={[styles.zoomControls, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.zoomButton, { borderBottomColor: colors.border }]}
            onPress={() => zoomMap(0.7)}
            accessibilityRole="button"
            accessibilityLabel="Збільшити масштаб мапи"
          >
            <Ionicons name="add" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.zoomButton}
            onPress={() => zoomMap(1.4)}
            accessibilityRole="button"
            accessibilityLabel="Зменшити масштаб мапи"
          >
            <Ionicons name="remove" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.mapFooter, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <View style={styles.footerText}>
          <Text style={[styles.footerTitle, { color: colors.textPrimary }]}>
            {layer === 'quests' ? `${visibleQuests.length} квестів поруч` : layer === 'reports' ? `${visibleReports.length} активностей поруч` : `${visibleImpacts.length} перевірених справ`}
          </Text>
          <Text style={[styles.footerSubtitle, { color: colors.textSecondary }]}>Дніпро · © OpenStreetMap contributors</Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshButton, { backgroundColor: colors.primaryLight }]}
          onPress={() => {
            setLoadedQuery('');
            void loadMap();
          }}
          accessibilityRole="button"
          accessibilityLabel="Оновити дані мапи"
        >
          <Ionicons name="refresh" size={19} color={colors.primaryDark} />
        </TouchableOpacity>
      </View>

      {selectedQuest && (
        <View style={[styles.bottomSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sheetHeader}>
            <Badge
              label={selectedQuest.status === 'available' ? 'Доступний квест' : selectedQuest.status}
              color={colors.primaryDark}
              bg={colors.primaryLight}
            />
            <TouchableOpacity onPress={() => setSelectedQuest(null)} accessibilityRole="button" accessibilityLabel="Закрити картку">
              <Ionicons name="close" size={21} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {selectedQuest.title || 'Екоквест'}
          </Text>
          <Text style={[styles.sheetSub, { color: colors.textSecondary }]}>
            {selectedQuest.owner_org_name || 'Організація'} · Складність {selectedQuest.difficulty || 1} · +{selectedQuest.reward_xp || 0} XP
          </Text>
          <Button
            title="Детальніше"
            colors={colors}
            variant="primary"
            onPress={() => onSelectTask(selectedQuest)}
          />
        </View>
      )}

      {selectedImpact && (
        <View style={[styles.impactSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {selectedImpact.title || 'Перевірена добра справа'}
            </Text>
            <TouchableOpacity onPress={() => setSelectedImpact(null)} accessibilityRole="button" accessibilityLabel="Закрити картку">
              <Ionicons name="close" size={21} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ImpactCompare item={selectedImpact} />
          <Text style={[styles.sheetSub, { color: colors.textSecondary }]}>
            Виконано на {selectedImpact.final_percent}% · {selectedImpact.owner_org_name || 'EcoQuest'}
          </Text>
          <Text style={[styles.teamLine, { color: colors.textPrimary }]}>
            Команда: {selectedImpact.team.map((member: ApiUser) => member.name).join(', ') || 'волонтери EcoQuest'}
          </Text>
        </View>
      )}

      {selectedReport && (
        <View style={[styles.reportSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sheetHeader}>
            <Badge label="Активність" color={colors.gold} bg={colors.goldLight} />
            <TouchableOpacity onPress={() => setSelectedReport(null)} accessibilityRole="button" accessibilityLabel="Закрити картку">
              <Ionicons name="close" size={21} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {getPhotoUrl(selectedReport.photo_url) ? (
            <Image source={{ uri: getPhotoUrl(selectedReport.photo_url) }} style={styles.reportPhoto} resizeMode="cover" />
          ) : null}
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
            {selectedReport.description || 'Проблему помітив мешканець'}
          </Text>
          <Text style={[styles.sheetSub, { color: colors.textSecondary }]}>
            {selectedReport.lat.toFixed(4)}, {selectedReport.lng.toFixed(4)} · {selectedReport.status}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const Stat: React.FC<{ label: string; value: number; colors: ThemeColors }> = ({ label, value, colors }) => (
  <View style={styles.statCell}>
    <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value.toLocaleString('uk-UA')}</Text>
    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
  </View>
);

const ImpactCompare: React.FC<{ item: ImpactItem }> = ({ item }) => {
  const [width, setWidth] = useState(1);
  const [split, setSplit] = useState(50);
  const imagePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => setSplit(clamp((event.nativeEvent.locationX / width) * 100, 5, 95)),
        onPanResponderMove: (event) => setSplit(clamp((event.nativeEvent.locationX / width) * 100, 5, 95)),
      }),
    [width],
  );
  const before = getPhotoUrl(item.photo_before_url);
  const after = getPhotoUrl(item.photo_after_url);

  return (
    <View style={styles.compareWrap}>
      <View
        style={styles.compareImage}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        {...imagePan.panHandlers}
      >
        {before ? <Image source={{ uri: before }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        <View style={[styles.afterClip, { width: `${split}%` }]}>
          {after ? <Image source={{ uri: after }} style={{ width, height: 134 }} resizeMode="cover" /> : null}
        </View>
        <View style={[styles.splitLine, { left: `${split}%` }]} />
        <View style={styles.photoLabels}>
          <Text style={styles.photoLabel}>ПІСЛЯ</Text>
          <Text style={styles.photoLabel}>ДО</Text>
        </View>
      </View>
      <Text style={styles.compareHint}>Перетягніть лінію, щоб порівняти результат</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { paddingHorizontal: 14, paddingTop: 7, paddingBottom: 8, borderBottomWidth: 1 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  heading: { fontSize: 23, fontWeight: '900' },
  subheading: { fontSize: 12, marginTop: 2 },
  locateButton: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  searchBox: { height: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center' },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14 },
  chipRow: { flexDirection: 'row', gap: 7, paddingTop: 9, paddingRight: 12 },
  filterChip: { height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  filterText: { fontSize: 12, fontWeight: '700' },
  statsStrip: { flexDirection: 'row', paddingVertical: 9, borderBottomWidth: 1 },
  statCell: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '900' },
  statLabel: { fontSize: 10, marginTop: 2 },
  map: { flex: 1, minHeight: 180, overflow: 'hidden', position: 'relative' },
  mapContents: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  mapTile: { position: 'absolute' },
  myLocationMarker: { position: 'absolute', width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14,165,233,0.25)', zIndex: 4 },
  myLocationDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0EA5E9', borderWidth: 2, borderColor: '#fff' },
  emptyMapCard: { position: 'absolute', alignSelf: 'center', top: '34%', width: '78%', maxWidth: 300, padding: 16, borderRadius: 18, alignItems: 'center', elevation: 4 },
  emptyMapIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyMapTitle: { fontSize: 14, fontWeight: '900' },
  emptyMapText: { fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: 4 },
  marker: { position: 'absolute', alignItems: 'center', width: 76, zIndex: 3 },
  markerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff', elevation: 3 },
  markerBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, marginTop: 2, elevation: 2 },
  markerBadgeText: { fontSize: 10, fontWeight: '900' },
  percentBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, marginTop: 2, elevation: 2 },
  loadingChip: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, elevation: 2 },
  loadingText: { fontSize: 11, fontWeight: '700' },
  errorChip: { position: 'absolute', top: 9, left: 9, right: 58, minHeight: 38, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 2 },
  errorText: { fontSize: 11, flex: 1 },
  addReportFab: { position: 'absolute', bottom: 18, right: 16, width: 50, height: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center', elevation: 5, zIndex: 4 },
  panHint: { position: 'absolute', bottom: 23, left: 14, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: 0.94 },
  panHintText: { fontSize: 10, fontWeight: '600' },
  zoomControls: { position: 'absolute', right: 16, bottom: 78, borderRadius: 12, borderWidth: 1, overflow: 'hidden', elevation: 3 },
  zoomButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1 },
  mapFooter: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, borderTopWidth: 1 },
  footerText: { gap: 2 },
  footerTitle: { fontSize: 13, fontWeight: '800' },
  footerSubtitle: { fontSize: 10 },
  refreshButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bottomSheet: { position: 'absolute', left: 12, right: 12, bottom: 64, zIndex: 6, padding: 14, borderRadius: 20, borderWidth: 1, elevation: 9 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 16, fontWeight: '900', marginTop: 8 },
  sheetSub: { fontSize: 12, marginTop: 4, marginBottom: 11 },
  impactSheet: { position: 'absolute', left: 12, right: 12, bottom: 62, zIndex: 6, padding: 12, borderRadius: 20, borderWidth: 1, elevation: 9 },
  reportSheet: { position: 'absolute', left: 12, right: 12, bottom: 62, zIndex: 6, padding: 12, borderRadius: 20, borderWidth: 1, elevation: 9 },
  reportPhoto: { height: 112, borderRadius: 12, marginTop: 8 },
  compareWrap: { marginTop: 9, marginBottom: 4 },
  compareImage: { height: 134, overflow: 'hidden', borderRadius: 13, backgroundColor: '#DCE8E1' },
  afterClip: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  splitLine: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: '#fff', marginLeft: -1.5 },
  photoLabels: { position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between' },
  photoLabel: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3, fontSize: 9, fontWeight: '900' },
  compareHint: { fontSize: 10, color: '#64748B', textAlign: 'center', marginTop: 5 },
  teamLine: { fontSize: 11, fontWeight: '700', marginTop: 5 },
});
